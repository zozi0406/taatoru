import type {
  AssignmentData,
  CollectionPage,
  IdentifiedResource,
  LevelProgressionData,
  Resource,
  ReviewStatisticData,
  StudyMaterialData,
  SubjectResource,
  UserData,
  VoiceActorData,
  WaniKaniObject,
} from '@/api/types';

const timestamp = '2026-07-29T12:34:56.123456Z';

export const userFixture = {
  object: 'user',
  url: 'https://api.wanikani.com/v2/user',
  data_updated_at: timestamp,
  data: {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'fixture_user',
    level: 8,
    profile_url: 'https://www.wanikani.com/users/fixture_user',
    started_at: '2024-01-02T03:04:05.000000Z',
    current_vacation_started_at: null,
    subscription: {
      active: true,
      type: 'recurring',
      max_level_granted: 60,
      period_ends_at: '2027-01-02T03:04:05.000000Z',
    },
    preferences: {
      default_voice_actor_id: 1,
      extra_study_autoplay_audio: false,
      lessons_autoplay_audio: true,
      lessons_batch_size: 5,
      lessons_presentation_order: 'ascending_level_then_subject',
      reviews_autoplay_audio: true,
      reviews_display_srs_indicator: true,
      reviews_presentation_order: 'shuffled',
    },
  },
} satisfies Resource<UserData, 'user'>;

export const radicalFixture = {
  id: 101,
  object: 'radical',
  url: 'https://api.wanikani.com/v2/subjects/101',
  data_updated_at: timestamp,
  data: {
    auxiliary_meanings: [],
    characters: '一',
    created_at: '2024-01-02T03:04:05.000000Z',
    document_url: 'https://www.wanikani.com/radicals/ground',
    hidden_at: null,
    lesson_position: 1,
    level: 1,
    meaning_mnemonic: 'The ground stretches from one side to the other.',
    meanings: [
      {
        meaning: 'Ground',
        primary: true,
        accepted_answer: true,
      },
    ],
    slug: 'ground',
    spaced_repetition_system_id: 1,
    amalgamation_subject_ids: [201],
    character_images: [],
  },
} satisfies SubjectResource;

export const kanjiFixture = {
  id: 201,
  object: 'kanji',
  url: 'https://api.wanikani.com/v2/subjects/201',
  data_updated_at: timestamp,
  data: {
    auxiliary_meanings: [
      {
        meaning: 'One Thing',
        type: 'whitelist',
      },
    ],
    characters: '一',
    created_at: '2024-01-02T03:04:05.000000Z',
    document_url: 'https://www.wanikani.com/kanji/一',
    hidden_at: null,
    lesson_position: 2,
    level: 1,
    meaning_mnemonic: 'One line is one.',
    meanings: [
      {
        meaning: 'One',
        primary: true,
        accepted_answer: true,
      },
    ],
    slug: '一',
    spaced_repetition_system_id: 1,
    amalgamation_subject_ids: [301],
    component_subject_ids: [101],
    meaning_hint: null,
    reading_hint: null,
    reading_mnemonic: 'Imagine saying ichi.',
    readings: [
      {
        reading: 'いち',
        primary: true,
        accepted_answer: true,
        type: 'onyomi',
      },
    ],
    visually_similar_subject_ids: [202],
  },
} satisfies SubjectResource;

export const vocabularyFixture = {
  id: 301,
  object: 'vocabulary',
  url: 'https://api.wanikani.com/v2/subjects/301',
  data_updated_at: timestamp,
  data: {
    auxiliary_meanings: [],
    characters: '一つ',
    created_at: '2024-01-02T03:04:05.000000Z',
    document_url: 'https://www.wanikani.com/vocabulary/一つ',
    hidden_at: null,
    lesson_position: 3,
    level: 1,
    meaning_mnemonic: 'Count one thing.',
    meanings: [
      {
        meaning: 'One Thing',
        primary: true,
        accepted_answer: true,
      },
    ],
    slug: '一つ',
    spaced_repetition_system_id: 1,
    component_subject_ids: [201],
    context_sentences: [
      {
        en: 'There is one apple.',
        ja: 'りんごが一つあります。',
      },
    ],
    parts_of_speech: ['numeral'],
    pronunciation_audios: [
      {
        url: 'https://files.wanikani.com/fixture-vocabulary.mp3',
        content_type: 'audio/mpeg',
        metadata: {
          gender: 'female',
          source_id: 30101,
          pronunciation: 'ひとつ',
          voice_actor_id: 1,
          voice_actor_name: 'Fixture Voice',
          voice_description: 'Tokyo accent',
        },
      },
    ],
    reading_mnemonic: 'It sounds like hitotsu.',
    readings: [
      {
        reading: 'ひとつ',
        primary: true,
        accepted_answer: true,
      },
    ],
  },
} satisfies SubjectResource;

export const kanaVocabularyFixture = {
  id: 401,
  object: 'kana_vocabulary',
  url: 'https://api.wanikani.com/v2/subjects/401',
  data_updated_at: timestamp,
  data: {
    auxiliary_meanings: [],
    characters: 'おやつ',
    created_at: '2024-01-02T03:04:05.000000Z',
    document_url: 'https://www.wanikani.com/vocabulary/おやつ',
    hidden_at: null,
    lesson_position: 4,
    level: 8,
    meaning_mnemonic: 'A snack between meals.',
    meanings: [
      {
        meaning: 'Snack',
        primary: true,
        accepted_answer: true,
      },
    ],
    slug: 'おやつ',
    spaced_repetition_system_id: 1,
    context_sentences: [
      {
        en: 'Shall we take a snack break?',
        ja: 'そろそろおやつにする？',
      },
    ],
    parts_of_speech: ['noun'],
    pronunciation_audios: [
      {
        url: 'https://files.wanikani.com/fixture-kana-vocabulary.ogg',
        content_type: 'audio/ogg',
        metadata: {
          gender: 'male',
          source_id: 40101,
          pronunciation: 'おやつ',
          voice_actor_id: 2,
          voice_actor_name: 'Fixture Voice Two',
          voice_description: 'Tokyo accent',
        },
      },
    ],
  },
} satisfies SubjectResource;

export const assignmentFixture = apiResource<AssignmentData, 'assignment'>({
  id: 501,
  object: 'assignment',
  data: {
    available_at: '2026-07-29T13:00:00.000000Z',
    burned_at: null,
    created_at: '2026-07-01T12:00:00.000000Z',
    hidden: false,
    passed_at: null,
    resurrected_at: null,
    srs_stage: 2,
    started_at: '2026-07-02T12:00:00.000000Z',
    subject_id: kanjiFixture.id,
    subject_type: kanjiFixture.object,
    unlocked_at: '2026-07-01T12:00:00.000000Z',
  },
});

export const studyMaterialFixture = apiResource<
  StudyMaterialData,
  'study_material'
>({
  id: 601,
  object: 'study_material',
  data: {
    created_at: '2026-07-02T12:00:00.000000Z',
    hidden: false,
    meaning_note: 'An invented meaning note.',
    meaning_synonyms: ['Single'],
    reading_note: 'An invented reading note.',
    subject_id: kanjiFixture.id,
    subject_type: kanjiFixture.object,
  },
});

export const levelProgressionFixture = apiResource<
  LevelProgressionData,
  'level_progression'
>({
  id: 701,
  object: 'level_progression',
  data: {
    abandoned_at: null,
    completed_at: null,
    created_at: '2026-07-01T12:00:00.000000Z',
    level: 8,
    passed_at: null,
    started_at: '2026-07-02T12:00:00.000000Z',
    unlocked_at: '2026-07-01T12:00:00.000000Z',
  },
});

export const voiceActorFixture = apiResource<VoiceActorData, 'voice_actor'>({
  id: 801,
  object: 'voice_actor',
  data: {
    created_at: '2026-07-01T12:00:00.000000Z',
    description: 'Fixture accent',
    gender: 'female',
    name: 'Fixture Voice',
  },
});

export const reviewStatisticFixture = apiResource<
  ReviewStatisticData,
  'review_statistic'
>({
  id: 901,
  object: 'review_statistic',
  data: {
    created_at: '2026-07-02T12:00:00.000000Z',
    hidden: false,
    meaning_correct: 8,
    meaning_current_streak: 4,
    meaning_incorrect: 1,
    meaning_max_streak: 7,
    percentage_correct: 85,
    reading_correct: 9,
    reading_current_streak: 5,
    reading_incorrect: 2,
    reading_max_streak: 8,
    subject_id: kanjiFixture.id,
    subject_type: kanjiFixture.object,
  },
});

export const subjectFixtures: readonly SubjectResource[] = [
  radicalFixture,
  kanjiFixture,
  vocabularyFixture,
  kanaVocabularyFixture,
];

interface ApiResourceInput<T, TObject extends WaniKaniObject> {
  readonly id: number;
  readonly object: TObject;
  readonly data: T;
}

function apiResource<T, TObject extends WaniKaniObject>({
  id,
  object,
  data,
}: ApiResourceInput<T, TObject>): IdentifiedResource<T, TObject> {
  return {
    id,
    object,
    url: `https://api.wanikani.com/v2/${object}s/${id}`,
    data_updated_at: timestamp,
    data,
  };
}

export function collectionPage<
  T,
  TObject extends WaniKaniObject = WaniKaniObject,
>(
  data: readonly IdentifiedResource<T, TObject>[],
  nextUrl: string | null = null,
): CollectionPage<T, TObject> {
  return {
    object: 'collection',
    url: 'https://api.wanikani.com/v2/fixtures',
    pages: {
      next_url: nextUrl,
      previous_url: null,
      per_page: 500,
    },
    total_count: data.length,
    data_updated_at: data.length === 0 ? null : timestamp,
    data,
  };
}
