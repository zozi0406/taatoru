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
// Modified by Taatoru from Tsurukame's LocalCachingClient.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type { Database, DatabaseTransaction } from '@/db/Database';
import { projectSrsStage } from './projection';
import type { ProgressOperationKind } from './types';

export interface LessonCompletion {
  readonly assignmentId: number;
  readonly subjectId: number;
  readonly completedAt: Date;
}

export interface ReviewCompletion extends LessonCompletion {
  readonly incorrectMeaningAnswers: number;
  readonly incorrectReadingAnswers: number;
}

export interface QueuedStudyMaterial {
  readonly subjectId: number;
  readonly meaningNote: string | null;
  readonly readingNote: string | null;
  readonly meaningSynonyms: readonly string[];
  readonly queuedAt: Date;
}

interface ProgressRow {
  readonly srsStage: number;
}

interface PendingProgressRow {
  readonly assignmentId: number;
  readonly operationKind: ProgressOperationKind;
}

interface StudyMaterialTargetRow {
  readonly subjectType: string;
  readonly localStudyMaterialId: number | null;
  readonly studyMaterialId: number | null;
}

export class PendingWriteRepository {
  constructor(private readonly db: Database) {}

  completeLesson(completion: LessonCompletion): Promise<void> {
    return this.completeProgress(
      completion,
      'lesson_start',
      0,
      0,
    );
  }

  completeReview(completion: ReviewCompletion): Promise<void> {
    return this.completeProgress(
      completion,
      'review',
      completion.incorrectMeaningAnswers,
      completion.incorrectReadingAnswers,
    );
  }

  queueStudyMaterial(material: QueuedStudyMaterial): Promise<void> {
    return this.db.transaction(async (tx) => {
      const target = await tx.first<StudyMaterialTargetRow>(
        `SELECT s.object AS subjectType,
                sm.id AS localStudyMaterialId,
                CASE WHEN sm.id > 0 THEN sm.id ELSE NULL END AS studyMaterialId
         FROM subjects s
         LEFT JOIN study_materials sm ON sm.subject_id = s.id
         WHERE s.id = ?`,
        [material.subjectId],
      );
      if (target === null) {
        throw new Error(`Unknown subject ${material.subjectId}`);
      }

      const synonymsJson = JSON.stringify(material.meaningSynonyms);
      const queuedAt = material.queuedAt.toISOString();
      if (target.localStudyMaterialId === null) {
        await tx.run(
          `INSERT INTO study_materials (
            id, subject_id, subject_type, meaning_note, reading_note,
            meaning_synonyms_json, hidden, data_updated_at, resource_json
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            -material.subjectId,
            material.subjectId,
            target.subjectType,
            material.meaningNote,
            material.readingNote,
            synonymsJson,
            queuedAt,
            JSON.stringify({ local: true }),
          ],
        );
      } else {
        await tx.run(
          `UPDATE study_materials
           SET meaning_note = ?,
               reading_note = ?,
               meaning_synonyms_json = ?
           WHERE subject_id = ?`,
          [
            material.meaningNote,
            material.readingNote,
            synonymsJson,
            material.subjectId,
          ],
        );
      }

      await tx.run(
        `INSERT INTO pending_study_materials (
          subject_id, study_material_id, meaning_note, reading_note,
          meaning_synonyms_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(subject_id) DO UPDATE SET
          study_material_id = excluded.study_material_id,
          meaning_note = excluded.meaning_note,
          reading_note = excluded.reading_note,
          meaning_synonyms_json = excluded.meaning_synonyms_json,
          created_at = excluded.created_at`,
        [
          material.subjectId,
          target.studyMaterialId,
          material.meaningNote,
          material.readingNote,
          synonymsJson,
          queuedAt,
        ],
      );
      await tx.run(
        'UPDATE subjects_fts SET synonyms = ? WHERE subject_id = ?',
        [material.meaningSynonyms.join(' '), material.subjectId],
      );
    });
  }

  private completeProgress(
    completion: LessonCompletion,
    kind: ProgressOperationKind,
    incorrectMeaningAnswers: number,
    incorrectReadingAnswers: number,
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.first<PendingProgressRow>(
        `SELECT assignment_id AS assignmentId,
                operation_kind AS operationKind
         FROM pending_progress
         WHERE subject_id = ?`,
        [completion.subjectId],
      );
      if (
        existing?.assignmentId === completion.assignmentId &&
        existing.operationKind === kind
      ) {
        return;
      }
      const progress = await currentProgress(tx, completion);
      const projection = projectSrsStage({
        kind,
        currentSrsStage: progress.srsStage,
        incorrectMeaningAnswers,
        incorrectReadingAnswers,
        now: completion.completedAt,
      });
      const completedAt = completion.completedAt.toISOString();
      const payloadJson = JSON.stringify({
        assignmentId: completion.assignmentId,
        subjectId: completion.subjectId,
        kind,
        incorrectMeaningAnswers,
        incorrectReadingAnswers,
        completedAt,
      });

      await tx.run(
        `INSERT INTO pending_progress (
          subject_id, assignment_id, operation_kind,
          incorrect_meaning_answers, incorrect_reading_answers,
          created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(subject_id) DO UPDATE SET
          assignment_id = excluded.assignment_id,
          operation_kind = excluded.operation_kind,
          incorrect_meaning_answers = excluded.incorrect_meaning_answers,
          incorrect_reading_answers = excluded.incorrect_reading_answers,
          created_at = excluded.created_at,
          payload_json = excluded.payload_json,
          attempt_count = 0,
          last_error_at = NULL`,
        [
          completion.subjectId,
          completion.assignmentId,
          kind,
          incorrectMeaningAnswers,
          incorrectReadingAnswers,
          completedAt,
          payloadJson,
        ],
      );
      await tx.run(
        'DELETE FROM assignments WHERE id = ? AND subject_id = ?',
        [completion.assignmentId, completion.subjectId],
      );
      await tx.run(
        `UPDATE subject_progress
         SET srs_stage = ?, last_mistake_at = ?
         WHERE subject_id = ?`,
        [
          projection.srsStage,
          projection.lastMistakeAt,
          completion.subjectId,
        ],
      );

      if (projection.lastMistakeAt !== null) {
        await tx.run(
          `INSERT INTO recent_mistakes (subject_id, mistaken_at)
           VALUES (?, ?)
           ON CONFLICT(subject_id) DO UPDATE SET
             mistaken_at = MAX(mistaken_at, excluded.mistaken_at)`,
          [completion.subjectId, projection.lastMistakeAt],
        );
      }
    });
  }
}

async function currentProgress(
  tx: DatabaseTransaction,
  completion: LessonCompletion,
): Promise<ProgressRow> {
  const row = await tx.first<ProgressRow>(
    `SELECT sp.srs_stage AS srsStage
     FROM subject_progress sp
     JOIN assignments a
       ON a.subject_id = sp.subject_id
      AND a.id = ?
     WHERE sp.subject_id = ?`,
    [completion.assignmentId, completion.subjectId],
  );
  if (row === null) {
    throw new Error(
      `Assignment ${completion.assignmentId} is not available for subject ${completion.subjectId}`,
    );
  }
  return row;
}
