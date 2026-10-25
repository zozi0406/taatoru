// Copyright 2025 David Sansome
// Copyright 2026 Taatoru contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified by Taatoru from Tsurukame's LocalCachingClient.swift and
// WaniKaniAPI/APIClient.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { ApiError } from '@/api/errors';
import type { Database } from '@/db/Database';
import type { SelectedPendingWrites, PendingProgressOperation } from './types';
import { WriteReconciler } from './WriteReconciler';
import { SyncRepository } from './SyncRepository';

type PendingProgressRow = PendingProgressOperation;

interface PendingStudyMaterialRow {
  readonly subjectId: number;
  readonly studyMaterialId: number | null;
  readonly meaningNote: string | null;
  readonly readingNote: string | null;
  readonly meaningSynonymsJson: string;
  readonly createdAt: string;
}

export class PendingWriteSender {
  constructor(
    private readonly db: Database,
    private readonly api: WaniKaniApi,
    private readonly ownerFence = 0,
  ) {}

  async sendSelectedPendingWrites(
    selection: SelectedPendingWrites,
    now: Date,
    signal?: AbortSignal,
  ): Promise<void> {
    const progressRows = await this.selectedProgress(selection.progressIds);
    for (const progress of progressRows) {
      await this.sendProgress(progress, now, signal);
    }

    const studyMaterialRows = await this.selectedStudyMaterials(
      selection.studyMaterialIds,
    );
    for (const material of studyMaterialRows) {
      await this.sendStudyMaterial(material, signal);
    }
  }

  private async sendProgress(
    progress: PendingProgressRow,
    now: Date,
    signal?: AbortSignal,
  ): Promise<void> {
    const repository = new SyncRepository(this.db);
    const reconciler = new WriteReconciler(this.db, this.api);
    const resolution = await reconciler.reconcileProgress(progress, now, signal);
    if (resolution.kind !== 'retry') {
      await repository.settleProgress(progress, resolution, now);
      return;
    }
    await this.db.transaction(async (tx) => {
      const result = await tx.run(`UPDATE pending_progress SET delivery_state = 'in_flight', wire_created_at = ?
        WHERE operation_key = ? AND revision = ?`, [resolution.wireCreatedAt, progress.operationKey, progress.revision]);
      if (result.changes !== 1) throw new Error('Pending operation changed before dispatch');
      await tx.run(`INSERT OR IGNORE INTO sync_dispatches
        (operation_key, revision, queue_kind, subject_id, account_epoch, payload_json, source_json, wire_created_at, delivery_state, owner_fence)
        VALUES (?, ?, 'progress', ?, ?, ?, ?, ?, 'in_flight', ?)`,
      [progress.operationKey, progress.revision, progress.subjectId, progress.accountEpoch, progress.payloadJson,
        progress.sourceJson, resolution.wireCreatedAt, this.ownerFence]);
    });
    try {
      let receipt;
      if (progress.kind === 'lesson_start') {
        receipt = await this.api.startAssignment({
          assignmentId: progress.assignmentId,
          startedAt: new Date(resolution.wireCreatedAt),
          ...(signal === undefined ? {} : { signal }),
        });
      } else {
        receipt = await this.api.createReview({
          assignmentId: progress.assignmentId,
          incorrectMeaningAnswers: progress.incorrectMeaningAnswers,
          incorrectReadingAnswers: progress.incorrectReadingAnswers,
          createdAt: new Date(resolution.wireCreatedAt),
          ...(signal === undefined ? {} : { signal }),
        });
      }
      if (receipt?.assignment.id !== progress.assignmentId || receipt.assignment.data.subject_id !== progress.subjectId)
        throw new Error('Invalid progress receipt');
      await repository.settleProgress(progress, { kind: 'acknowledged', receipt, reason: 'server-receipt' }, now);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const result = await reconciler.reconcileProgress({ ...progress, wireCreatedAt: resolution.wireCreatedAt }, now, signal);
        await repository.settleProgress(progress, result.kind === 'retry'
          ? { kind: 'attention', reason: 'validation-rejected' } : result, now);
        return;
      }
      const state = error instanceof ApiError && [401, 403, 429].includes(error.status ?? 0) ? 'queued' : 'uncertain';
      await this.db.run(
        `UPDATE pending_progress
         SET attempt_count = attempt_count + 1,
             last_error_at = ?, delivery_state = ?, last_error_kind = 'delivery-interrupted'
         WHERE operation_key = ? AND revision = ?`,
        [now.toISOString(), state, progress.operationKey, progress.revision],
      );
      await this.db.run(`UPDATE sync_dispatches SET delivery_state = ? WHERE operation_key = ? AND revision = ?`,
        [state, progress.operationKey, progress.revision]);
      throw error;
    }
  }

  private async sendStudyMaterial(
    material: PendingStudyMaterialRow,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.api.upsertStudyMaterial({
      subjectId: material.subjectId,
      ...(material.studyMaterialId === null
        ? {}
        : { studyMaterialId: material.studyMaterialId }),
      meaningNote: material.meaningNote,
      readingNote: material.readingNote,
      meaningSynonyms: parseSynonyms(material.meaningSynonymsJson),
      ...(signal === undefined ? {} : { signal }),
    });
    await this.db.run(
      `DELETE FROM pending_study_materials
       WHERE subject_id = ?
         AND study_material_id IS ?
         AND meaning_note IS ?
         AND reading_note IS ?
         AND created_at = ?
         AND meaning_synonyms_json = ?`,
      [
        material.subjectId,
        material.studyMaterialId,
        material.meaningNote,
        material.readingNote,
        material.createdAt,
        material.meaningSynonymsJson,
      ],
    );
  }

  private selectedProgress(
    subjectIds: readonly number[],
  ): Promise<readonly PendingProgressRow[]> {
    if (subjectIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.db.all<PendingProgressRow>(
      `SELECT subject_id AS subjectId,
              assignment_id AS assignmentId,
              operation_kind AS kind,
              incorrect_meaning_answers AS incorrectMeaningAnswers,
              incorrect_reading_answers AS incorrectReadingAnswers,
              created_at AS createdAt,
              payload_json AS payloadJson, operation_key AS operationKey, revision,
              account_epoch AS accountEpoch, delivery_state AS deliveryState,
              source_json AS sourceJson, wire_created_at AS wireCreatedAt, attempt_count AS attemptCount
       FROM pending_progress
       WHERE subject_id IN (${placeholders(subjectIds.length)})
         AND delivery_state != 'rejected'
       ORDER BY created_at, subject_id`,
      subjectIds,
    );
  }

  private selectedStudyMaterials(
    subjectIds: readonly number[],
  ): Promise<readonly PendingStudyMaterialRow[]> {
    if (subjectIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.db.all<PendingStudyMaterialRow>(
      `SELECT subject_id AS subjectId,
              study_material_id AS studyMaterialId,
              meaning_note AS meaningNote,
              reading_note AS readingNote,
              meaning_synonyms_json AS meaningSynonymsJson,
              created_at AS createdAt
       FROM pending_study_materials
       WHERE subject_id IN (${placeholders(subjectIds.length)})
       ORDER BY created_at, subject_id`,
      subjectIds,
    );
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function parseSynonyms(value: string): readonly string[] {
  const decoded: unknown = JSON.parse(value);
  if (
    !Array.isArray(decoded) ||
    !decoded.every((synonym) => typeof synonym === 'string')
  ) {
    throw new Error('Invalid pending study-material synonyms');
  }
  return decoded;
}
