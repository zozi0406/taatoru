import {
  kanaVocabularyFixture,
  kanjiFixture,
  vocabularyFixture,
} from '@/fixtures/api';

export const answerKanji = {
  ...kanjiFixture,
  data: {
    ...kanjiFixture.data,
    auxiliary_meanings: [
      ...kanjiFixture.data.auxiliary_meanings,
      { meaning: 'Single', type: 'whitelist' as const },
      { meaning: 'Lonely', type: 'blacklist' as const },
    ],
    readings: [
      {
        reading: 'いち',
        primary: true,
        accepted_answer: true,
        type: 'onyomi' as const,
      },
      {
        reading: 'ひと',
        primary: false,
        accepted_answer: false,
        type: 'kunyomi' as const,
      },
    ],
  },
};

export const answerVocabulary = {
  ...vocabularyFixture,
  data: {
    ...vocabularyFixture.data,
    characters: '食べる',
    meanings: [
      { meaning: 'To Eat', primary: true, accepted_answer: true },
    ],
    readings: [
      { reading: 'たべる', primary: true, accepted_answer: true },
    ],
  },
};

export const answerKanaVocabulary = kanaVocabularyFixture;
