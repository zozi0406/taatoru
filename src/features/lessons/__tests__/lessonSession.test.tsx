import {
  act,
  fireEvent,
  screen,
} from '@testing-library/react-native';

import type { LessonSessionSnapshot } from '@/features/sessions/SessionRepository';
import { radicalFixture } from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { LessonSessionScreen } from '../LessonSessionScreen';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    seekTo: jest.fn(async () => undefined),
  }),
}));

test('moves from subject presentation to quiz and completes once', async () => {
  const onCompleteLesson = jest.fn(async () => undefined);
  const onFinish = jest.fn(async () => undefined);
  const onSaveSnapshot = jest.fn(async () => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <LessonSessionScreen
        initialSnapshot={snapshot()}
        onCompleteLesson={onCompleteLesson}
        onExit={jest.fn()}
        onFinish={onFinish}
        onSaveSnapshot={onSaveSnapshot}
        subjects={[radicalFixture]}
      />
    </ThemeProvider>,
  );

  expect(screen.getByText('The ground stretches from one side to the other.')).toBeVisible();
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Continue to quiz' }));
  });
  expect(screen.getByText('Meaning')).toBeVisible();

  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'sky');
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
  });
  expect(await screen.findByText('Try again')).toBeVisible();
  expect(onCompleteLesson).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'ground');
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
  });
  expect(onCompleteLesson).toHaveBeenCalledTimes(1);
  expect(onCompleteLesson).toHaveBeenCalledWith({
    assignmentId: 501,
    subjectId: radicalFixture.id,
  });
  expect(await screen.findByText('Lesson complete')).toBeVisible();

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Finish lessons' }));
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
        onCompleteLesson={jest.fn(async () => undefined)}
        onExit={jest.fn()}
        onFinish={jest.fn(async () => undefined)}
        onPlayAudio={onPlayAudio}
        onSaveSnapshot={jest.fn(async () => undefined)}
        subjects={[imageRadical]}
      />
    </ThemeProvider>,
  );

  expect(screen.getByLabelText('Ground radical image')).toBeVisible();
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
