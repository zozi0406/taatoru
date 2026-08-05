import type { AssignmentData, IdentifiedResource } from '@/api/types';
import type { Database } from '../Database';
import { SUBJECT_WITHIN_GRANTED_LEVEL } from '../subscription';

export interface AvailableAssignment {
  readonly assignmentId: number;
  readonly subjectId: number;
  readonly subjectType: string;
  readonly srsStage: number;
  readonly availableAt: string | null;
}

interface SubjectLevelRow {
  readonly level: number;
}

export class AssignmentRepository {
  constructor(private readonly db: Database) {}

  replaceAssignments(
    resources: readonly IdentifiedResource<AssignmentData, 'assignment'>[],
    cursor: string | null,
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      for (const resource of resources) {
        const data = resource.data;
        await tx.run(
          `INSERT INTO assignments (
            id, subject_id, subject_type, srs_stage, available_at, unlocked_at,
            started_at, passed_at, burned_at, resurrected_at, hidden,
            data_updated_at, resource_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(subject_id) DO UPDATE SET
            id = excluded.id,
            subject_id = excluded.subject_id,
            subject_type = excluded.subject_type,
            srs_stage = excluded.srs_stage,
            available_at = excluded.available_at,
            unlocked_at = excluded.unlocked_at,
            started_at = excluded.started_at,
            passed_at = excluded.passed_at,
            burned_at = excluded.burned_at,
            resurrected_at = excluded.resurrected_at,
            hidden = excluded.hidden,
            data_updated_at = excluded.data_updated_at,
            resource_json = excluded.resource_json`,
          [
            resource.id,
            data.subject_id,
            data.subject_type,
            data.srs_stage,
            data.available_at,
            data.unlocked_at,
            data.started_at,
            data.passed_at,
            data.burned_at,
            data.resurrected_at,
            data.hidden,
            resource.data_updated_at,
            JSON.stringify(resource),
          ],
        );
        const subject = await tx.first<SubjectLevelRow>(
          'SELECT level FROM subjects WHERE id = ?',
          [data.subject_id],
        );
        if (subject !== null) {
          await tx.run(
            `INSERT INTO subject_progress (
              subject_id, assignment_id, subject_type, level, srs_stage,
              available_at, started_at, passed_at, burned_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(subject_id) DO UPDATE SET
              assignment_id = excluded.assignment_id,
              subject_type = excluded.subject_type,
              level = excluded.level,
              srs_stage = excluded.srs_stage,
              available_at = excluded.available_at,
              started_at = excluded.started_at,
              passed_at = excluded.passed_at,
              burned_at = excluded.burned_at`,
            [
              data.subject_id,
              resource.id,
              data.subject_type,
              subject.level,
              data.srs_stage,
              data.available_at,
              data.started_at,
              data.passed_at,
              data.burned_at,
            ],
          );
        }
      }
      await tx.run(
        'UPDATE sync_state SET assignments_updated_at = ? WHERE id = 1',
        [cursor],
      );
    });
  }

  async getAvailableLessons(
    _now: Date,
  ): Promise<readonly AvailableAssignment[]> {
    return this.db.all<AvailableAssignment>(
      `${BASE_ASSIGNMENT_QUERY}
       WHERE a.srs_stage = 0
         AND a.unlocked_at IS NOT NULL
         AND a.started_at IS NULL
         AND a.hidden = 0
         AND s.hidden_at IS NULL
         AND ${SUBJECT_WITHIN_GRANTED_LEVEL}
         AND ${NOT_EXCLUDED}
       ORDER BY s.level, s.lesson_position, s.id`,
    );
  }
}

export const BASE_ASSIGNMENT_QUERY = `SELECT
  a.id AS assignmentId,
  a.subject_id AS subjectId,
  a.subject_type AS subjectType,
  a.srs_stage AS srsStage,
  a.available_at AS availableAt
FROM assignments a
JOIN subjects s ON s.id = a.subject_id`;

export const NOT_EXCLUDED = `NOT EXISTS (
  SELECT 1 FROM study_materials sm
  WHERE sm.subject_id = a.subject_id
    AND instr(COALESCE(sm.meaning_note, ''), '#tsurukameExclude') > 0
)`;
