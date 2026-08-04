import {
  act,
  fireEvent,
  screen,
} from '@testing-library/react-native';

import type { ReviewSessionSnapshot } from '@/features/reviews/ReviewSessionRepository';
import { radicalFixture } from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { ReviewSessionScreen } from '../ReviewSessionScreen';
import type { ReviewTransition } from '../reviewReducer';

test('records incorrect answers and completes a review once', async () => {
  const onCommitTransition = jest.fn<
    Promise<void>,
    [ReviewTransition]
  >(async () => undefined);
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
    fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'sky');
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
  });
  expect(await screen.findByText('Try again')).toBeVisible();
  expect(onCommitTransition).toHaveBeenLastCalledWith(
    expect.objectContaining({
      completedItem: null,
      snapshot: expect.objectContaining({
        incorrectMeaningBySubject: { [radicalFixture.id]: 1 },
      }),
    }),
  );

  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'ground');
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
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
    fireEvent.press(screen.getByRole('button', { name: 'Finish reviews' }));
  });
  expect(onFinish).toHaveBeenCalledTimes(1);
});

test('retry guidance does not persist an answer event', async () => {
  const onCommitTransition = jest.fn<
    Promise<void>,
    [ReviewTransition]
  >(async () => undefined);
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
    fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'ち');
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
  });

  expect(
    await screen.findByText('Check the prompt and try again'),
  ).toBeVisible();
  expect(onCommitTransition).not.toHaveBeenCalled();
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
