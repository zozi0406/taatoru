// Copyright 2026 David Sansome
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

import type {
  IdentifiedResource,
  LevelProgressionData,
  Resource,
  ReviewStatisticData,
  StudyMaterialData,
  SubjectData,
  SubjectObject,
  UserData,
  VoiceActorData,
  AssignmentData,
} from '@/api/types';
import type { Database } from '@/db/Database';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { ReviewStatisticRepository } from '@/db/repositories/ReviewStatisticRepository';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { mergeRecentMistakes } from './recentMistakes';
import type { RecentMistake } from './types';

export interface SyncCursors {
  readonly assignments: string | null;
  readonly studyMaterials: string | null;
  readonly subjects: string | null;
  readonly voiceActors: string | null;
  readonly reviewStatistics: string | null;
}

export interface SyncStateSnapshot {
  readonly cursors: SyncCursors;
  readonly progressIds: readonly number[];
  readonly studyMaterialIds: readonly number[];
}

export interface SafeSyncErrorRecord {
  readonly kind: string;
  readonly message: string;
  readonly status: number | null;
  readonly safeUrl: string | null;
  readonly retryAt: string | null;
}

export interface SyncDataRepository {
  getStateSnapshot(): Promise<SyncStateSnapshot>;
  prepareFullRefresh(now: Date): Promise<readonly RecentMistake[]>;
  restoreRecentMistakes(
    mistakes: readonly RecentMistake[],
    now: Date,
  ): Promise<void>;
  replaceSubjects(
    resources: readonly IdentifiedResource<SubjectData, SubjectObject>[],
    cursor: string | null,
  ): Promise<void>;
  replaceAssignments(
    resources: readonly IdentifiedResource<AssignmentData, 'assignment'>[],
    cursor: string | null,
  ): Promise<void>;
  replaceStudyMaterials(
    resources: readonly IdentifiedResource<
      StudyMaterialData,
      'study_material'
    >[],
    cursor: string | null,
  ): Promise<void>;
  replaceUser(resource: Resource<UserData, 'user'>): Promise<void>;
  replaceLevelProgressions(
    resources: readonly IdentifiedResource<
      LevelProgressionData,
      'level_progression'
    >[],
  ): Promise<void>;
  replaceVoiceActors(
    resources: readonly IdentifiedResource<VoiceActorData, 'voice_actor'>[],
    cursor: string | null,
  ): Promise<void>;
  replaceReviewStatistics(
    resources: readonly IdentifiedResource<
      ReviewStatisticData,
      'review_statistic'
    >[],
    cursor: string | null,
  ): Promise<void>;
  markSyncCompleted(mode: 'quick' | 'full', now: Date): Promise<void>;
  recordSyncError(
    phase: string,
    error: SafeSyncErrorRecord,
    now: Date,
  ): Promise<void>;
}

interface SyncStateRow {
  readonly assignments: string | null;
  readonly studyMaterials: string | null;
  readonly subjects: string | null;
  readonly voiceActors: string | null;
  readonly reviewStatistics: string | null;
}

interface SubjectIdRow {
  readonly subjectId: number;
}

interface MistakeRow {
  readonly subjectId: number;
  readonly mistakenAt: string;
}

interface MaxLevelRow {
  readonly maxLevelGranted: number;
}

export class SyncRepository implements SyncDataRepository {
  private readonly assignments: AssignmentRepository;
  private readonly resources: ResourceRepository;
  private readonly reviewStatistics: ReviewStatisticRepository;
  private readonly studyMaterials: StudyMaterialRepository;
  private readonly subjects: SubjectRepository;

  constructor(private readonly db: Database) {
    this.assignments = new AssignmentRepository(db);
    this.resources = new ResourceRepository(db);
    this.reviewStatistics = new ReviewStatisticRepository(db);
    this.studyMaterials = new StudyMaterialRepository(db);
    this.subjects = new SubjectRepository(db);
  }

  async getStateSnapshot(): Promise<SyncStateSnapshot> {
    const cursors = await this.db.first<SyncStateRow>(
      `SELECT assignments_updated_at AS assignments,
              study_materials_updated_at AS studyMaterials,
              subjects_updated_at AS subjects,
              voice_actors_updated_at AS voiceActors,
              review_statistics_updated_at AS reviewStatistics
       FROM sync_state WHERE id = 1`,
    );
    if (cursors === null) {
      throw new Error('Missing synchronization state');
    }

    const progress = await this.db.all<SubjectIdRow>(
      `SELECT subject_id AS subjectId
       FROM pending_progress
       ORDER BY created_at, subject_id`,
    );
    const studyMaterials = await this.db.all<SubjectIdRow>(
      `SELECT subject_id AS subjectId
       FROM pending_study_materials
       ORDER BY created_at, subject_id`,
    );

    return {
      cursors,
      progressIds: progress.map(({ subjectId }) => subjectId),
      studyMaterialIds: studyMaterials.map(({ subjectId }) => subjectId),
    };
  }

  async prepareFullRefresh(now: Date): Promise<readonly RecentMistake[]> {
    const recentMistakes = mergeRecentMistakes(
      await this.db.all<MistakeRow>(
        `SELECT subject_id AS subjectId, mistaken_at AS mistakenAt
         FROM recent_mistakes`,
      ),
      await this.db.all<MistakeRow>(
        `SELECT subject_id AS subjectId, last_mistake_at AS mistakenAt
         FROM subject_progress
         WHERE last_mistake_at IS NOT NULL`,
      ),
      now,
    );

    await this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM assignments');
      await tx.run('DELETE FROM study_materials');
      await tx.run('DELETE FROM review_statistics');
      await tx.run('DELETE FROM audio_urls');
      await tx.run('DELETE FROM subject_progress');
      await tx.run('DELETE FROM subjects_fts');
      await tx.run('DELETE FROM subjects');
      await tx.run('DELETE FROM voice_actors');
      await tx.run('DELETE FROM recent_mistakes');
      for (const mistake of recentMistakes) {
        await tx.run(
          `INSERT INTO recent_mistakes (subject_id, mistaken_at)
           VALUES (?, ?)`,
          [mistake.subjectId, mistake.mistakenAt],
        );
      }
      await tx.run(
        `UPDATE sync_state SET
          assignments_updated_at = NULL,
          study_materials_updated_at = NULL,
          subjects_updated_at = NULL,
          voice_actors_updated_at = NULL,
          review_statistics_updated_at = NULL
         WHERE id = 1`,
      );
    });

    return recentMistakes;
  }

  async restoreRecentMistakes(
    mistakes: readonly RecentMistake[],
    now: Date,
  ): Promise<void> {
    const current = await this.db.all<MistakeRow>(
      `SELECT subject_id AS subjectId, mistaken_at AS mistakenAt
       FROM recent_mistakes`,
    );
    const merged = mergeRecentMistakes(mistakes, current, now);

    await this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM recent_mistakes');
      for (const mistake of merged) {
        await tx.run(
          `INSERT INTO recent_mistakes (subject_id, mistaken_at)
           VALUES (?, ?)`,
          [mistake.subjectId, mistake.mistakenAt],
        );
        await tx.run(
          `UPDATE subject_progress
           SET last_mistake_at = MAX(
             COALESCE(last_mistake_at, ''),
             ?
           )
           WHERE subject_id = ?`,
          [mistake.mistakenAt, mistake.subjectId],
        );
      }
    });
  }

  replaceSubjects(
    resources: readonly IdentifiedResource<SubjectData, SubjectObject>[],
    cursor: string | null,
  ): Promise<void> {
    return this.subjects.replaceSubjects(resources, cursor);
  }

  replaceAssignments(
    resources: readonly IdentifiedResource<AssignmentData, 'assignment'>[],
    cursor: string | null,
  ): Promise<void> {
    return this.assignments.replaceAssignments(resources, cursor);
  }

  replaceStudyMaterials(
    resources: readonly IdentifiedResource<
      StudyMaterialData,
      'study_material'
    >[],
    cursor: string | null,
  ): Promise<void> {
    return this.studyMaterials.replaceStudyMaterials(resources, cursor);
  }

  async replaceUser(resource: Resource<UserData, 'user'>): Promise<void> {
    const previous = await this.db.first<MaxLevelRow>(
      'SELECT max_level_granted AS maxLevelGranted FROM user LIMIT 1',
    );
    await this.resources.replaceUser(resource);
    if (
      previous !== null &&
      resource.data.subscription.max_level_granted >
        previous.maxLevelGranted
    ) {
      await this.db.run(
        'UPDATE sync_state SET subjects_updated_at = NULL WHERE id = 1',
      );
    }
  }

  replaceLevelProgressions(
    resources: readonly IdentifiedResource<
      LevelProgressionData,
      'level_progression'
    >[],
  ): Promise<void> {
    return this.resources.replaceLevelProgressions(resources);
  }

  replaceVoiceActors(
    resources: readonly IdentifiedResource<VoiceActorData, 'voice_actor'>[],
    cursor: string | null,
  ): Promise<void> {
    return this.resources.replaceVoiceActors(resources, cursor);
  }

  replaceReviewStatistics(
    resources: readonly IdentifiedResource<
      ReviewStatisticData,
      'review_statistic'
    >[],
    cursor: string | null,
  ): Promise<void> {
    return this.reviewStatistics.replaceReviewStatistics(resources, cursor);
  }

  async markSyncCompleted(
    mode: 'quick' | 'full',
    now: Date,
  ): Promise<void> {
    const timestamp = now.toISOString();
    await this.db.run(
      `UPDATE sync_state
       SET last_sync_at = ?,
           last_full_sync_at = CASE
             WHEN ? = 'full' THEN ?
             ELSE last_full_sync_at
           END
       WHERE id = 1`,
      [timestamp, mode, timestamp],
    );
  }

  async recordSyncError(
    phase: string,
    error: SafeSyncErrorRecord,
    now: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO sync_errors (
          occurred_at, phase, kind, status, safe_url, retry_at, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          now.toISOString(),
          phase,
          error.kind,
          error.status,
          error.safeUrl,
          error.retryAt,
          error.message,
        ],
      );
      await tx.run(
        `DELETE FROM sync_errors
         WHERE id NOT IN (
           SELECT id FROM sync_errors ORDER BY id DESC LIMIT 100
         )`,
      );
    });
  }

  async clearForLogout(): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const table of [
        'assignments',
        'pending_progress',
        'pending_study_materials',
        'study_materials',
        'review_statistics',
        'audio_urls',
        'subject_progress',
        'subjects_fts',
        'subjects',
        'voice_actors',
        'level_progressions',
        'user',
        'recent_mistakes',
        'sync_errors',
        'active_sessions',
      ]) {
        await tx.run(`DELETE FROM ${table}`);
      }
      await tx.run(
        `UPDATE sync_state SET
          assignments_updated_at = NULL,
          study_materials_updated_at = NULL,
          subjects_updated_at = NULL,
          voice_actors_updated_at = NULL,
          review_statistics_updated_at = NULL,
          last_full_sync_at = NULL,
          last_sync_at = NULL
         WHERE id = 1`,
      );
    });
  }
}
