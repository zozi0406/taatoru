import { checkAnswer, normalizeAnswer } from '../answerChecker';
import {
  answerKanaVocabulary,
  answerKanji,
  answerVocabulary,
} from '../testFixtures';

test('normalizes whitespace, capitalization, and meaning punctuation', () => {
  expect(normalizeAnswer(" Foo-B.a'/r nn ", 'meaning')).toBe('foo bar nn');
  expect(
    checkAnswer({
      answer: '  ONE  ',
      prompt: 'meaning',
      subject: answerKanji,
    }),
  ).toEqual({ verdict: 'correct', matched: 'One' });
});

test('keeps long-vowel marks when converting a romaji reading', () => {
  expect(
    checkAnswer({
      answer: 'ko-hi-',
      prompt: 'reading',
      subject: {
        ...answerVocabulary,
        data: {
          ...answerVocabulary.data,
          characters: 'コーヒー',
          readings: [
            { reading: 'コーヒー', primary: true, accepted_answer: true },
          ],
        },
      },
    }),
  ).toEqual({ verdict: 'correct', matched: 'コーヒー' });
});

test('accepts auxiliary meanings and user synonyms', () => {
  expect(answer('single', 'meaning')).toEqual({
    verdict: 'correct',
    matched: 'Single',
  });
  expect(answer('unity', 'meaning', { meaningSynonyms: ['Unity'] })).toEqual({
    verdict: 'correct',
    matched: 'Unity',
  });
});

test('forbidden meanings remain incorrect even near an accepted answer', () => {
  expect(answer('lonely', 'meaning')).toEqual({
    verdict: 'incorrect',
    expected: ['One', 'One Thing', 'Single'],
  });
});

test('handles close meanings according to exact-match preference', () => {
  expect(answer('sngle', 'meaning')).toEqual({
    verdict: 'correct',
    matched: 'Single',
  });
  expect(answer('sngle', 'meaning', { exactMatch: true })).toEqual({
    verdict: 'retry',
    reason: 'close-answer',
  });
});

test('converts romaji and katakana before matching readings', () => {
  expect(answer('ichi', 'reading')).toEqual({
    verdict: 'correct',
    matched: 'いち',
  });
  expect(answer('イチ', 'reading')).toEqual({
    verdict: 'correct',
    matched: 'いち',
  });
});

test('asks again for a valid alternate kanji reading', () => {
  expect(answer('hito', 'reading')).toEqual({
    verdict: 'retry',
    reason: 'other-kanji-reading',
  });
});

test('distinguishes reading-for-meaning and meaning-for-reading', () => {
  expect(answer('ichi', 'meaning')).toEqual({
    verdict: 'retry',
    reason: 'reading-instead-of-meaning',
  });
  expect(answer('one', 'reading')).toEqual({
    verdict: 'retry',
    reason: 'meaning-instead-of-reading',
  });
});

test('flags mismatching vocabulary okurigana without counting it wrong', () => {
  expect(
    checkAnswer({
      answer: 'たべます',
      prompt: 'reading',
      subject: answerVocabulary,
    }),
  ).toEqual({
    verdict: 'retry',
    reason: 'mismatching-okurigana',
  });
});

test('accepts kana vocabulary meaning and its kana as a reading', () => {
  expect(
    checkAnswer({
      answer: 'snack',
      prompt: 'meaning',
      subject: answerKanaVocabulary,
    }),
  ).toEqual({ verdict: 'correct', matched: 'Snack' });
  expect(
    checkAnswer({
      answer: 'oyatsu',
      prompt: 'reading',
      subject: answerKanaVocabulary,
    }),
  ).toEqual({ verdict: 'correct', matched: 'おやつ' });
});

test('returns the expected accepted answers for a genuine miss', () => {
  expect(answer('seven', 'meaning')).toEqual({
    verdict: 'incorrect',
    expected: ['One', 'One Thing', 'Single'],
  });
});

function answer(
  value: string,
  prompt: 'meaning' | 'reading',
  options: {
    readonly exactMatch?: boolean;
    readonly meaningSynonyms?: readonly string[];
  } = {},
) {
  return checkAnswer({
    answer: value,
    prompt,
    subject: answerKanji,
    ...options,
  });
}
