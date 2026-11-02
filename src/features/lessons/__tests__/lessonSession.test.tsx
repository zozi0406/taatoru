import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { radicalImages } from '@/features/media/radicalImages';
import { LessonAvailabilityChangedError, type LessonSessionSnapshot } from '@/features/sessions/SessionRepository';
import { radicalFixture, kanjiFixture } from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { LessonSessionScreen } from '../LessonSessionScreen';
import type { LessonTransition } from '../lessonReducer';

let mockPresentationQuiz: (() => void) | undefined;
jest.mock('../LessonSubjectStage', () => {
  const actual = jest.requireActual('../LessonSubjectStage');
  const React = jest.requireActual('react');
  return { ...actual, LessonSubjectStage: (props: Parameters<typeof import('../LessonSubjectStage').LessonSubjectStage>[0]) => {
    mockPresentationQuiz = props.onQuiz;
    return React.createElement(actual.LessonSubjectStage, props);
  } };
});

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    seekTo: jest.fn(async () => undefined),
  }),
}));

test('moves from subject presentation to quiz and completes once', async () => {
  const onCommitTransition = jest.fn<Promise<void>, [LessonTransition]>(
    async () => undefined,
  );
  const onFinish = jest.fn(async () => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <LessonSessionScreen
        initialSnapshot={snapshot()}
        onCommitTransition={onCommitTransition}
        onExit={jest.fn()}
        onFinish={onFinish}
        subjects={[radicalFixture]}
      />
    </ThemeProvider>,
  );

  expect(
    screen.getByText('The ground stretches from one side to the other.'),
  ).toBeVisible();
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Continue to quiz' }),
    );
  });
  expect(screen.getByText('Meaning')).toBeVisible();

  await act(async () => {
    await fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'sky');
  });
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Submit answer' }),
    );
  });
  expect(await screen.findByText('Incorrect')).toBeVisible();
  expect(
    onCommitTransition.mock.calls.some(
      ([transition]) => transition.completedItem !== null,
    ),
  ).toBe(false);

  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  });
  await act(async () => {
    await fireEvent.changeText(
      screen.getByLabelText('Meaning answer'),
      'ground',
    );
  });
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Submit answer' }),
    );
  });
  expect(onCommitTransition).toHaveBeenLastCalledWith(
    expect.objectContaining({
      completedItem: {
        assignmentId: 501,
        subjectId: radicalFixture.id,
      },
      snapshot: expect.objectContaining({ phase: 'complete' }),
    }),
  );
  expect(await screen.findByText('Lesson complete')).toBeVisible();

  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Finish lessons' }),
    );
  });
  expect(onFinish).toHaveBeenCalledTimes(1);
});

test('renders a locally prepared radical image with a neutral accessibility label', async () => {
  const load = jest.spyOn(radicalImages, 'load').mockResolvedValue({
    kind: 'svg',
    content: '<svg viewBox="0 0 10 10"><path d="M1 1h8v8H1z"/></svg>',
  });
  const onPlayAudio = jest.fn();
  const imageRadical = {
    ...radicalFixture,
    data: {
      ...radicalFixture.data,
      characters: null,
      character_images: [
        {
          url: 'https://media.example.test/lesson-square.svg',
          content_type: 'image/svg+xml' as const,
          metadata: {},
        },
      ],
    },
  };
  await renderApp(
    <ThemeProvider scheme="light">
      <LessonSessionScreen
        initialSnapshot={snapshot()}
        onCommitTransition={jest.fn(async () => undefined)}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
        onPlayAudio={onPlayAudio}
        subjects={[imageRadical]}
      />
    </ThemeProvider>,
  );

  await waitFor(() => expect(screen.getByLabelText('Radical image')).toBeVisible());
  load.mockRestore();
});

test('can read forward and back before starting the quiz without completing lessons', async () => {
  const commit = jest.fn(async (_transition: LessonTransition) => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <LessonSessionScreen
        initialSnapshot={{
          ...snapshot(),
          items: [
            snapshot().items[0]!,
            { assignmentId: 502, subjectId: kanjiFixture.id },
          ],
        }}
        onCommitTransition={commit}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
        subjects={[radicalFixture, kanjiFixture]}
      />
    </ThemeProvider>,
  );
  expect(
    screen.getByRole('button', { name: 'Previous lesson subject' }),
  ).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Next lesson subject' }),
  );
  expect(screen.getByText('Imagine saying ichi.')).toBeVisible();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Previous lesson subject' }),
  );
  expect(
    screen.getByText('The ground stretches from one side to the other.'),
  ).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Start quiz' }));
  expect(screen.getByLabelText('Meaning answer')).toBeVisible();
  expect(
    commit.mock.calls.every(
      ([transition]) => transition.completedItem === null,
    ),
  ).toBe(true);
});

test('two presentation taps in one event turn create one durable transition', async () => {
  let finish!: () => void;
  const commit = jest.fn((_transition: LessonTransition) => new Promise<void>((resolve) => { finish = resolve; }));
  await renderApp(<ThemeProvider scheme="light"><LessonSessionScreen initialSnapshot={snapshot()}
    onCommitTransition={commit} onExit={jest.fn()} onFinish={async () => {}} subjects={[radicalFixture]} /></ThemeProvider>);
  const press = mockPresentationQuiz!;
  await act(async () => { press(); press(); });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Exit lesson session' })).toBeDisabled();
  await act(async () => { finish(); });
  expect(screen.getByLabelText('Meaning answer')).toBeVisible();
});

function snapshot(): LessonSessionSnapshot {
  return {
    id: 'lesson',
    kind: 'lesson',
    phase: 'presentation',
    items: [{ assignmentId: 501, subjectId: radicalFixture.id }],
    queuePosition: 0,
    quizState: {
      completedSubjectIds: [],
      currentPrompt: null,
      currentSubjectId: null,
      incorrectMeaningBySubject: {},
      incorrectReadingBySubject: {},
    },
    createdAt: '2026-07-29T12:00:00.000Z',
    updatedAt: '2026-07-29T12:00:00.000Z',
  };
}

test('a stale lesson save offers safe reload and home instead of retrying a stale completion', async () => {
  const onReload = jest.fn();
  const onExit = jest.fn();
  await renderApp(<ThemeProvider scheme="light"><LessonSessionScreen
    initialSnapshot={snapshot()}
    onCommitTransition={async () => { throw new LessonAvailabilityChangedError(); }}
    onReload={onReload} onExit={onExit} onFinish={async () => undefined} subjects={[radicalFixture]}
  /></ThemeProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue to quiz' }));
  await screen.findByText('Lesson availability changed. Reload lessons to continue.');
  await fireEvent.press(screen.getByRole('button', { name: 'Reload lessons' }));
  expect(onReload).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Return home' }));
  expect(onExit).toHaveBeenCalledTimes(1);
});
