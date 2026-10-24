import { act, waitFor } from '@testing-library/react-native';

import LessonSessionRoute from '../../../../app/lessons/session';
import ReviewSessionRoute from '../../../../app/reviews/session';
import type { Resource, UserData } from '@/api/types';
import type { Database } from '@/db/Database';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { ReviewSessionRepository } from '@/features/reviews/ReviewSessionRepository';
import { SessionRepository } from '@/features/sessions/SessionRepository';
import {
  assignmentFixture,
  kanjiFixture,
  userFixture,
} from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';

let mockDatabase: Database;
let mockOnLessonRender: (() => void) | null = null;
let mockOnReplace: ((path: string) => void) | null = null;
let mockOnReviewRender: (() => void) | null = null;
const mockRouter = {
  replace: jest.fn((path: string) => mockOnReplace?.(path)),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@/app/AppProviders', () => ({
  useAppServices: () => ({ db: mockDatabase }),
}));

jest.mock('@/features/lessons/LessonSessionScreen', () => ({
  LessonSessionScreen: () => {
    mockOnLessonRender?.();
    return null;
  },
}));

jest.mock('@/features/reviews/ReviewSessionScreen', () => ({
  ReviewSessionScreen: () => {
    mockOnReviewRender?.();
    return null;
  },
}));

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    seekTo: jest.fn(async () => undefined),
  }),
}));

beforeEach(() => {
  mockRouter.replace.mockClear();
  mockOnLessonRender = null;
  mockOnReplace = null;
  mockOnReviewRender = null;
});

test('discards an inaccessible resumed lesson session and returns to the picker', async () => {
  const db = await subscriptionDatabase();
  mockDatabase = db;
  try {
    const repository = new SessionRepository(db);
    await repository.startLessonSession([
      {
        assignmentId: 1_402,
        available: true,
        excluded: false,
        lessonPosition: 402,
        level: 4,
        subjectId: 402,
        subjectType: 'kanji',
      },
    ]);

    const redirected = new Promise<void>((resolve) => {
      mockOnReplace = (path) => {
        if (path === '/lessons/picker') resolve();
      };
    });
    await renderApp(
      <ThemeProvider scheme="light">
        <LessonSessionRoute />
      </ThemeProvider>,
    );
    await act(async () => {
      await redirected;
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/lessons/picker');
    await expect(repository.loadLessonSession()).resolves.toBeNull();
  } finally {
    await db.close();
  }
});

test('replaces an inaccessible resumed review session with eligible reviews', async () => {
  const db = await subscriptionDatabase();
  mockDatabase = db;
  try {
    await new AssignmentRepository(db).replaceAssignments(
      [reviewAssignment(kanjiFixture.id), reviewAssignment(402)],
      null,
    );
    const repository = new ReviewSessionRepository(db);
    await repository.startReviewSession([
      { assignmentId: 1_402, subjectId: 402 },
    ]);

    const rendered = new Promise<void>((resolve) => {
      mockOnReviewRender = resolve;
    });
    await renderApp(
      <ThemeProvider scheme="light">
        <ReviewSessionRoute />
      </ThemeProvider>,
    );
    await act(async () => {
      await rendered;
    });

    const restored = await repository.loadReviewSession();
    expect(restored?.items).toEqual([
      {
        assignmentId: 1_000 + kanjiFixture.id,
        subjectId: kanjiFixture.id,
      },
    ]);
  } finally {
    await db.close();
  }
});

test('preserves eligible lesson progress when pruning an inaccessible item', async () => {
  const db = await subscriptionDatabase();
  mockDatabase = db;
  try {
    const repository = new SessionRepository(db);
    const started = await repository.startLessonSession([
      lessonCandidate(kanjiFixture.id, 1),
      lessonCandidate(402, 4),
    ]);
    await repository.saveLessonSession({
      ...started,
      phase: 'quiz',
      queuePosition: 0,
      quizState: {
        completedSubjectIds: [],
        currentPrompt: 'reading',
        currentSubjectId: kanjiFixture.id,
        incorrectMeaningBySubject: { [kanjiFixture.id]: 2 },
        incorrectReadingBySubject: {},
      },
    });
    await renderApp(
      <ThemeProvider scheme="light">
        <LessonSessionRoute />
      </ThemeProvider>,
    );
    await waitFor(async () => {
      await expect(repository.loadLessonSession()).resolves.toMatchObject({
        items: [
          {
            assignmentId: 1_000 + kanjiFixture.id,
            subjectId: kanjiFixture.id,
          },
        ],
        phase: 'quiz',
        queuePosition: 0,
        quizState: {
          currentPrompt: 'reading',
          currentSubjectId: kanjiFixture.id,
          incorrectMeaningBySubject: { [kanjiFixture.id]: 2 },
        },
      });
    });
  } finally {
    await db.close();
  }
});

test('preserves eligible review scoring when pruning a later inaccessible item', async () => {
  const db = await subscriptionDatabase();
  mockDatabase = db;
  try {
    await new AssignmentRepository(db).replaceAssignments(
      [reviewAssignment(kanjiFixture.id), reviewAssignment(402)],
      null,
    );
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession([
      {
        assignmentId: 1_000 + kanjiFixture.id,
        subjectId: kanjiFixture.id,
      },
      { assignmentId: 1_402, subjectId: 402 },
    ]);
    await db.run(
      `UPDATE active_sessions
       SET state_json = ?
       WHERE id = 'review' AND kind = 'review'`,
      [
        JSON.stringify({
          ...started,
          currentPrompt: 'reading',
          incorrectMeaningBySubject: { [kanjiFixture.id]: 2 },
        }),
      ],
    );
    await renderApp(
      <ThemeProvider scheme="light">
        <ReviewSessionRoute />
      </ThemeProvider>,
    );
    await waitFor(async () => {
      await expect(repository.loadReviewSession()).resolves.toMatchObject({
        items: [
          {
            assignmentId: 1_000 + kanjiFixture.id,
            subjectId: kanjiFixture.id,
          },
        ],
        currentPrompt: 'reading',
        incorrectMeaningBySubject: { [kanjiFixture.id]: 2 },
        phase: 'active',
        queuePosition: 0,
      });
    });
  } finally {
    await db.close();
  }
});

test('advances a resumed review when its current item is inaccessible', async () => {
  const db = await subscriptionDatabase();
  mockDatabase = db;
  try {
    await new AssignmentRepository(db).replaceAssignments(
      [reviewAssignment(kanjiFixture.id), reviewAssignment(402)],
      null,
    );
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession([
      { assignmentId: 1_402, subjectId: 402 },
      {
        assignmentId: 1_000 + kanjiFixture.id,
        subjectId: kanjiFixture.id,
      },
    ]);
    await db.run(
      `UPDATE active_sessions
       SET state_json = ?
       WHERE id = 'review' AND kind = 'review'`,
      [
        JSON.stringify({
          ...started,
          currentPrompt: 'reading',
          incorrectMeaningBySubject: {
            [kanjiFixture.id]: 1,
            402: 2,
          },
        }),
      ],
    );

    await renderApp(
      <ThemeProvider scheme="light">
        <ReviewSessionRoute />
      </ThemeProvider>,
    );
    await waitFor(async () => {
      await expect(repository.loadReviewSession()).resolves.toMatchObject({
        items: [
          {
            assignmentId: 1_000 + kanjiFixture.id,
            subjectId: kanjiFixture.id,
          },
        ],
        currentPrompt: 'meaning',
        incorrectMeaningBySubject: { [kanjiFixture.id]: 1 },
        phase: 'active',
        queuePosition: 0,
      });
    });
  } finally {
    await db.close();
  }
});

async function subscriptionDatabase(): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new ResourceRepository(db).replaceUser(freeUser());
  await new SubjectRepository(db).replaceSubjects(
    [
      kanjiFixture,
      {
        ...kanjiFixture,
        id: 402,
        url: 'https://api.wanikani.com/v2/subjects/402',
        data: { ...kanjiFixture.data, level: 4 },
      },
    ],
    null,
  );
  return db;
}

function freeUser(): Resource<UserData, 'user'> {
  return {
    ...userFixture,
    data: {
      ...userFixture.data,
      subscription: {
        ...userFixture.data.subscription,
        active: false,
        max_level_granted: 3,
        period_ends_at: null,
        type: 'free',
      },
    },
  };
}

function reviewAssignment(subjectId: number) {
  return {
    ...assignmentFixture,
    id: 1_000 + subjectId,
    url: `https://api.wanikani.com/v2/assignments/${1_000 + subjectId}`,
    data: {
      ...assignmentFixture.data,
      available_at: '2026-08-01T00:00:00.000000Z',
      subject_id: subjectId,
    },
  };
}

function lessonCandidate(subjectId: number, level: number) {
  return {
    assignmentId: 1_000 + subjectId,
    available: true,
    excluded: false,
    lessonPosition: subjectId,
    level,
    subjectId,
    subjectType: 'kanji' as const,
  };
}
