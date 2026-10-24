import { act, fireEvent, screen } from '@testing-library/react-native';

import type { ReviewSessionSnapshot } from '@/features/reviews/ReviewSessionRepository';
import {
  radicalFixture,
  kanjiFixture,
  vocabularyFixture,
} from '@/fixtures/api';
import { DEFAULT_STUDY_SETTINGS } from '@/features/settings/studySettings';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { ReviewSessionScreen } from '../ReviewSessionScreen';
import type { ReviewTransition } from '../reviewReducer';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    seekTo: jest.fn(async () => undefined),
  }),
}));

test('records incorrect answers and completes a review once', async () => {
  const onCommitTransition = jest.fn<Promise<void>, [ReviewTransition]>(
    async () => undefined,
  );
  const onFinish = jest.fn(async () => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <ReviewSessionScreen
        initialSnapshot={snapshot()}
        onCommitTransition={onCommitTransition}
        onExit={jest.fn()}
        onFinish={onFinish}
        subjects={[radicalFixture]}
      />
    </ThemeProvider>,
  );

  await act(async () => {
    await fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'sky');
  });
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Submit answer' }),
    );
  });
  expect(await screen.findByText('Incorrect')).toBeVisible();
  expect(onCommitTransition).toHaveBeenLastCalledWith(
    expect.objectContaining({
      completedItem: null,
      snapshot: expect.objectContaining({
        incorrectMeaningBySubject: { [radicalFixture.id]: 1 },
      }),
    }),
  );

  expect(screen.getByText('Ground')).toBeVisible();
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
        incorrectMeaningAnswers: 1,
        incorrectReadingAnswers: 0,
      },
      snapshot: expect.objectContaining({ phase: 'complete' }),
    }),
  );
  expect(await screen.findByText('Reviews complete')).toBeVisible();

  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Finish reviews' }),
    );
  });
  expect(onFinish).toHaveBeenCalledTimes(1);
});

test('an explicit override removes the current mistake before completing once', async () => {
  const commit = jest.fn(async (_transition: ReviewTransition) => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <ReviewSessionScreen
        initialSnapshot={snapshot()}
        subjects={[radicalFixture]}
        onCommitTransition={commit}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
      />
    </ThemeProvider>,
  );
  await act(async () => {
    await fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'sky');
  });
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Submit answer' }),
    );
  });
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'My answer was correct' }),
    );
  });
  expect(commit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      completedItem: expect.objectContaining({
        incorrectMeaningAnswers: 0,
        incorrectReadingAnswers: 0,
      }),
    }),
  );
  expect(screen.getByText('Reviews complete')).toBeVisible();
});

test('a failed completion remains retryable and never displays a successful result', async () => {
  const commit = jest
    .fn()
    .mockRejectedValueOnce(new Error('Device storage busy'))
    .mockResolvedValue(undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <ReviewSessionScreen
        initialSnapshot={snapshot()}
        subjects={[radicalFixture]}
        onCommitTransition={commit}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
      />
    </ThemeProvider>,
  );
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
  expect(screen.getByRole('alert')).toHaveTextContent(
    /Unable to preserve review progress/,
  );
  expect(screen.queryByText('Correct')).toBeNull();
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Try saving again' }),
    );
  });
  expect(screen.getByText('Reviews complete')).toBeVisible();
});

test('retry guidance does not persist an answer event', async () => {
  const onCommitTransition = jest.fn<Promise<void>, [ReviewTransition]>(
    async () => undefined,
  );
  await renderApp(
    <ThemeProvider scheme="light">
      <ReviewSessionScreen
        initialSnapshot={snapshot()}
        onCommitTransition={onCommitTransition}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
        subjects={[radicalFixture]}
      />
    </ThemeProvider>,
  );

  await act(async () => {
    await fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'ち');
  });
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Submit answer' }),
    );
  });

  expect(
    await screen.findByText('Check the prompt and try again'),
  ).toBeVisible();
  expect(onCommitTransition).not.toHaveBeenCalled();
});

test('accepts cached personal synonyms during a review', async () => {
  const commit = jest.fn(async (_transition: ReviewTransition) => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <ReviewSessionScreen
        initialSnapshot={snapshot()}
        subjects={[radicalFixture]}
        studyMaterials={{
          [radicalFixture.id]: {
            meaningNote: null,
            readingNote: null,
            meaningSynonyms: ['Earth'],
          },
        }}
        onCommitTransition={commit}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
      />
    </ThemeProvider>,
  );
  await submit('Earth');
  expect(screen.getByText('Reviews complete')).toBeVisible();
  expect(commit.mock.calls[0]?.[0].completedItem?.incorrectMeaningAnswers).toBe(
    0,
  );
});

test('reading-first still requires meaning and keeps unattempted details hidden', async () => {
  const commit = jest.fn(async (_transition: ReviewTransition) => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <ReviewSessionScreen
        initialSnapshot={{
          ...snapshot(),
          currentPrompt: 'reading',
          questionProgress: {},
          items: [{ assignmentId: 501, subjectId: kanjiFixture.id }],
        }}
        subjects={[kanjiFixture]}
        settings={{
          ...DEFAULT_STUDY_SETTINGS,
          questionOrder: 'reading-first',
          autoAdvance: false,
        }}
        onCommitTransition={commit}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
      />
    </ThemeProvider>,
  );
  await act(async () => {
    await fireEvent.changeText(screen.getByLabelText('Reading answer'), 'ichi');
  });
  expect(screen.getByLabelText('Reading answer')).toHaveProp('value', 'いち');
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Submit answer' }),
    );
  });
  expect(screen.getByText('Correct')).toBeVisible();
  expect(screen.queryByText('One line is one.')).toBeNull();
  expect(commit).not.toHaveBeenCalled();
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  });
  expect(screen.getByLabelText('Meaning answer')).toBeVisible();
  expect(commit.mock.calls[0]?.[0].completedItem).toBeNull();
  await submit('one');
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  });
  expect(screen.getByText('Reviews complete')).toBeVisible();
  expect(
    commit.mock.calls.filter(
      ([transition]) => transition.completedItem !== null,
    ),
  ).toHaveLength(1);
});

test('blocks duplicate submissions while a review is being persisted', async () => {
  let finish!: () => void;
  const commit = jest.fn(
    (_transition: ReviewTransition) =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await renderApp(
    <ThemeProvider scheme="light">
      <ReviewSessionScreen
        initialSnapshot={snapshot()}
        subjects={[radicalFixture]}
        onCommitTransition={commit}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
      />
    </ThemeProvider>,
  );
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
    await fireEvent.press(
      screen.getByRole('button', { name: 'Submit answer' }),
    );
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Exit review session' }),
  ).toBeDisabled();
  await act(async () => {
    finish();
  });
  expect(screen.getByText('Reviews complete')).toBeVisible();
});

async function submit(answer: string) {
  await act(async () => {
    await fireEvent.changeText(screen.getByLabelText('Meaning answer'), answer);
  });
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Submit answer' }),
    );
  });
}

test('autoplays a correct vocabulary reading without letting audio failure repeat a grade', async () => {
  const commit = jest.fn(async (_transition: ReviewTransition) => undefined);
  const play = jest.fn(() => {
    throw new Error('Audio unavailable');
  });
  await renderApp(
    <ThemeProvider scheme="light">
      <ReviewSessionScreen
        initialSnapshot={{
          ...snapshot(),
          currentPrompt: 'reading',
          questionProgress: {
            answeredMeaningSubjectIds: [vocabularyFixture.id],
          },
          items: [{ assignmentId: 501, subjectId: vocabularyFixture.id }],
        }}
        subjects={[vocabularyFixture]}
        settings={{ ...DEFAULT_STUDY_SETTINGS, autoplay: true }}
        onPlayAudio={play}
        onCommitTransition={commit}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
      />
    </ThemeProvider>,
  );
  await fireEvent.changeText(
    screen.getByLabelText('Reading answer'),
    'hitotsu',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
  expect(play).toHaveBeenCalledWith(
    vocabularyFixture.data.pronunciation_audios[0]!.url,
  );
  expect(screen.getByText('Reviews complete')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(commit).toHaveBeenCalledTimes(1);
});

function snapshot(): ReviewSessionSnapshot {
  return {
    id: 'review',
    kind: 'review',
    phase: 'active',
    items: [{ assignmentId: 501, subjectId: radicalFixture.id }],
    queuePosition: 0,
    currentPrompt: 'meaning',
    incorrectMeaningBySubject: {},
    incorrectReadingBySubject: {},
    createdAt: '2026-07-29T12:00:00.000Z',
    updatedAt: '2026-07-29T12:00:00.000Z',
  };
}
