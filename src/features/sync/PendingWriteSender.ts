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
import type { SelectedPendingWrites } from './types';

const REVIEW_CREATED_AT_DELAY_MS = 15 * 60 * 1_000;

interface PendingProgressRow {
  readonly subjectId: number;
  readonly assignmentId: number;
  readonly kind: 'lesson_start' | 'review';
  readonly incorrectMeaningAnswers: number;
  readonly incorrectReadingAnswers: number;
  readonly createdAt: string;
  readonly payloadJson: string;
}

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
    try {
      if (progress.kind === 'lesson_start') {
        await this.api.startAssignment({
          assignmentId: progress.assignmentId,
          startedAt: new Date(progress.createdAt),
          ...(signal === undefined ? {} : { signal }),
        });
      } else {
        const createdAt = new Date(progress.createdAt);
        const includeCreatedAt =
          now.getTime() - createdAt.getTime() > REVIEW_CREATED_AT_DELAY_MS;
        await this.api.createReview({
          assignmentId: progress.assignmentId,
          incorrectMeaningAnswers: progress.incorrectMeaningAnswers,
          incorrectReadingAnswers: progress.incorrectReadingAnswers,
          ...(includeCreatedAt ? { createdAt } : {}),
          ...(signal === undefined ? {} : { signal }),
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        await this.deleteProgress(progress);
        return;
      }
      await this.db.run(
        `UPDATE pending_progress
         SET attempt_count = attempt_count + 1,
             last_error_at = ?
         WHERE subject_id = ?
           AND created_at = ?
           AND payload_json = ?`,
        [
          now.toISOString(),
          progress.subjectId,
          progress.createdAt,
          progress.payloadJson,
        ],
      );
      throw error;
    }

    await this.deleteProgress(progress);
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

  private deleteProgress(progress: PendingProgressRow): Promise<unknown> {
    return this.db.run(
      `DELETE FROM pending_progress
       WHERE subject_id = ?
         AND created_at = ?
         AND payload_json = ?`,
      [progress.subjectId, progress.createdAt, progress.payloadJson],
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
              payload_json AS payloadJson
       FROM pending_progress
       WHERE subject_id IN (${placeholders(subjectIds.length)})
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
