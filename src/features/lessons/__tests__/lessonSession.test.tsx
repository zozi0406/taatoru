import { act, fireEvent, screen } from '@testing-library/react-native';

import type { LessonSessionSnapshot } from '@/features/sessions/SessionRepository';
import { radicalFixture, kanjiFixture } from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { LessonSessionScreen } from '../LessonSessionScreen';
import type { LessonTransition } from '../lessonReducer';

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

test('renders a radical image and exposes pronunciation audio', async () => {
  const onPlayAudio = jest.fn();
  const imageRadical = {
    ...radicalFixture,
    data: {
      ...radicalFixture.data,
      characters: null,
      character_images: [
        {
          url: 'https://example.com/radical.png',
          content_type: 'image/png' as const,
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

  expect(screen.getByLabelText('Ground radical image')).toBeVisible();
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
