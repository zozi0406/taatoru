import type { SubjectObject } from '@/api/types';

export type LessonSubjectType = SubjectObject;

export interface LessonCandidate {
  readonly assignmentId: number;
  readonly available: boolean;
  readonly excluded: boolean;
  readonly lessonPosition: number;
  readonly level: number;
  readonly subjectId: number;
  readonly subjectType: LessonSubjectType;
}

export interface LessonTypeGroup {
  readonly items: readonly LessonCandidate[];
  readonly subjectType: LessonSubjectType;
}

export interface LessonLevelGroup {
  readonly level: number;
  readonly sections: readonly LessonTypeGroup[];
}
