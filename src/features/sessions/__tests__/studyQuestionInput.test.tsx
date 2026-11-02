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
    ['annai', ['あ', 'あn', 'あん', 'あんあ', 'あんあい']],
    [
      'konnichiha',
      ['k', 'こ', 'こn', 'こん', 'こんい', 'こんいc', 'こんいch', 'こんいち', 'こんいちh', 'こんいちは'],
    ],
    ['shinnyuu', ['s', 'sh', 'し', 'しn', 'しん', 'しんy', 'しんゆ', 'しんゆう']],
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
  test.each([
    [['n', 'nn', '', 'a'], 'あ'],
    [['n', 'nn', 'んa'], 'んあ'],
    [['n', 'nn', 'んai'], 'んあい'],
    [['nn', 'んa'], 'んあ'],
    [['n', 'nn', 'aん', 'あんa'], 'あんあ'],
    [['n', 'nn', 'aん'], 'あん'],
    [['annai'], 'あんない'],
    [["shin'you"], 'しんよう'],
    [['n', 'nn', 'んか', 'んかa'], 'んかあ'],
  ] as const)(
    'respects deletion, replacement and pasted text: %j',
    async (edits, expected) => {
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
            onSubmit={jest.fn()}
            onContinue={jest.fn()}
            onOverride={jest.fn()}
            onSkip={jest.fn()}
            onRetrySave={jest.fn()}
          />
        </ThemeProvider>,
      );
      for (const value of edits) {
        await fireEvent.changeText(screen.getByLabelText('Reading answer'), value);
      }
      expect(screen.getByLabelText('Reading answer')).toHaveDisplayValue(expected);
    },
  );
});
