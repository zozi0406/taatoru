import { fireEvent, screen } from '@testing-library/react-native';

import { LessonQuizStage } from '@/features/lessons/LessonQuizStage';
import { ReviewPrompt } from '@/features/reviews/ReviewPrompt';
import { DEFAULT_STUDY_SETTINGS } from '@/features/settings/studySettings';
import { kanjiFixture } from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    seekTo: jest.fn(async () => undefined),
  }),
}));

describe.each([
  ['review', ReviewPrompt],
  ['lesson', LessonQuizStage],
] as const)('%s reading input', (_kind, Prompt) => {
  test.each([
    ['ma', ['m', 'ま']],
    ['yama', ['y', 'や', 'やm', 'やま']],
    ['mya', ['m', 'my', 'みゃ']],
    ['mma', ['m', 'っm', 'っま']],
    ['sempai', ['s', 'せ', 'せm', 'せんp', 'せんぱ', 'せんぱい']],
    ['na', ['n', 'な']],
    ['nn', ['n', 'ん']],
  ] as const)('converts %s as each character is entered', async (romaji, values) => {
    const submit = jest.fn();
    await renderApp(
      <ThemeProvider scheme="light">
        <Prompt
          feedback={null}
          index={0}
          total={1}
          subject={kanjiFixture}
          prompt="reading"
          settings={DEFAULT_STUDY_SETTINGS}
          busy={false}
          error={null}
          onExit={jest.fn()}
          onSubmit={submit}
          onContinue={jest.fn()}
          onOverride={jest.fn()}
          onSkip={jest.fn()}
          onRetrySave={jest.fn()}
        />
      </ThemeProvider>,
    );

    for (let index = 0; index < romaji.length; index += 1) {
      const input = screen.getByLabelText('Reading answer');
      await fireEvent.changeText(input, input.props.value + romaji[index]);
      expect(screen.getByLabelText('Reading answer')).toHaveDisplayValue(
        values[index]!,
      );
    }

    await fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
    expect(submit).toHaveBeenCalledWith(values[values.length - 1]);
  });
});
