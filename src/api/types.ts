// Copyright 2025 David Sansome
// Copyright 2026 Taatoru contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified by Taatoru from Tsurukame's WaniKaniAPI/Subject.swift and
// WaniKaniAPI/APIClient.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

export type WaniKaniTimestamp = string;

export type SubjectObject =
  | 'kana_vocabulary'
  | 'kanji'
  | 'radical'
  | 'vocabulary';

export type WaniKaniObject =
  | 'assignment'
  | 'level_progression'
  | 'review_statistic'
  | 'study_material'
  | 'user'
  | 'voice_actor'
  | SubjectObject;

export interface Resource<
  T,
  TObject extends WaniKaniObject = WaniKaniObject,
> {
  readonly id?: number;
  readonly object: TObject;
  readonly url: string;
  readonly data_updated_at: WaniKaniTimestamp;
  readonly data: T;
}

export type IdentifiedResource<
  T,
  TObject extends WaniKaniObject = WaniKaniObject,
> = Resource<T, TObject> & {
  readonly id: number;
};

export interface CollectionPage<
  T,
  TObject extends WaniKaniObject = WaniKaniObject,
> {
  readonly object: 'collection';
  readonly url: string;
  readonly pages: {
    readonly next_url: string | null;
    readonly previous_url: string | null;
    readonly per_page: number;
  };
  readonly total_count: number;
  readonly data_updated_at: WaniKaniTimestamp | null;
  readonly data: readonly IdentifiedResource<T, TObject>[];
}

export interface UserData {
  readonly id: string;
  readonly username: string;
  readonly level: number;
  readonly profile_url: string;
  readonly started_at: WaniKaniTimestamp;
  readonly current_vacation_started_at: WaniKaniTimestamp | null;
  readonly subscription: {
    readonly active: boolean;
    readonly type: 'free' | 'lifetime' | 'recurring';
    readonly max_level_granted: number;
    readonly period_ends_at: WaniKaniTimestamp | null;
  };
  readonly preferences: {
    readonly default_voice_actor_id: number;
    readonly extra_study_autoplay_audio: boolean;
    readonly lessons_autoplay_audio: boolean;
    readonly lessons_batch_size: number;
    readonly lessons_presentation_order: string;
    readonly reviews_autoplay_audio: boolean;
    readonly reviews_display_srs_indicator: boolean;
    readonly reviews_presentation_order: 'lower_levels_first' | 'shuffled';
  };
}

export interface Meaning {
  readonly meaning: string;
  readonly primary: boolean;
  readonly accepted_answer: boolean;
}

export interface AuxiliaryMeaning {
  readonly meaning: string;
  readonly type: 'blacklist' | 'whitelist';
}

export interface SubjectCommonData {
  readonly auxiliary_meanings: readonly AuxiliaryMeaning[];
  readonly characters: string | null;
  readonly created_at: WaniKaniTimestamp;
  readonly document_url: string;
  readonly hidden_at: WaniKaniTimestamp | null;
  readonly lesson_position: number;
  readonly level: number;
  readonly meaning_mnemonic: string;
  readonly meanings: readonly Meaning[];
  readonly slug: string;
  readonly spaced_repetition_system_id: number;
}

export interface CharacterImage {
  readonly url: string;
  readonly content_type: 'image/png' | 'image/svg+xml';
  readonly metadata: {
    readonly inline_styles?: boolean;
    readonly color?: string;
    readonly dimensions?: string;
    readonly style_name?: string;
  };
}

export interface KanjiReading {
  readonly reading: string;
  readonly primary: boolean;
  readonly accepted_answer: boolean;
  readonly type: 'kunyomi' | 'nanori' | 'onyomi';
}

export interface VocabularyReading {
  readonly reading: string;
  readonly primary: boolean;
  readonly accepted_answer: boolean;
}

export type Reading = KanjiReading | VocabularyReading;

export interface ContextSentence {
  readonly en: string;
  readonly ja: string;
}

export interface PronunciationAudio {
  readonly url: string;
  readonly content_type: 'audio/mpeg' | 'audio/ogg';
  readonly metadata: {
    readonly gender: string;
    readonly source_id: number;
    readonly pronunciation: string;
    readonly voice_actor_id: number;
    readonly voice_actor_name: string;
    readonly voice_description: string;
  };
}

export interface RadicalData extends SubjectCommonData {
  readonly amalgamation_subject_ids: readonly number[];
  readonly character_images: readonly CharacterImage[];
}

export interface KanjiData extends SubjectCommonData {
  readonly amalgamation_subject_ids: readonly number[];
  readonly component_subject_ids: readonly number[];
  readonly meaning_hint: string | null;
  readonly reading_hint: string | null;
  readonly reading_mnemonic: string;
  readonly readings: readonly KanjiReading[];
  readonly visually_similar_subject_ids: readonly number[];
}

export interface VocabularyData extends SubjectCommonData {
  readonly component_subject_ids: readonly number[];
  readonly context_sentences: readonly ContextSentence[];
  readonly parts_of_speech: readonly string[];
  readonly pronunciation_audios: readonly PronunciationAudio[];
  readonly reading_mnemonic: string;
  readonly readings: readonly VocabularyReading[];
}

export interface KanaVocabularyData extends SubjectCommonData {
  readonly context_sentences: readonly ContextSentence[];
  readonly parts_of_speech: readonly string[];
  readonly pronunciation_audios: readonly PronunciationAudio[];
}

export type SubjectData =
  | KanaVocabularyData
  | KanjiData
  | RadicalData
  | VocabularyData;

export type SubjectResource =
  | IdentifiedResource<KanaVocabularyData, 'kana_vocabulary'>
  | IdentifiedResource<KanjiData, 'kanji'>
  | IdentifiedResource<RadicalData, 'radical'>
  | IdentifiedResource<VocabularyData, 'vocabulary'>;

export interface AssignmentData {
  readonly available_at: WaniKaniTimestamp | null;
  readonly burned_at: WaniKaniTimestamp | null;
  readonly created_at: WaniKaniTimestamp;
  readonly hidden: boolean;
  readonly passed_at: WaniKaniTimestamp | null;
  readonly resurrected_at: WaniKaniTimestamp | null;
  readonly srs_stage: number;
  readonly started_at: WaniKaniTimestamp | null;
  readonly subject_id: number;
  readonly subject_type: SubjectObject;
  readonly unlocked_at: WaniKaniTimestamp | null;
}

export interface StudyMaterialData {
  readonly created_at: WaniKaniTimestamp;
  readonly hidden: boolean;
  readonly meaning_note: string | null;
  readonly meaning_synonyms: readonly string[];
  readonly reading_note: string | null;
  readonly subject_id: number;
  readonly subject_type: SubjectObject;
}

export interface LevelProgressionData {
  readonly abandoned_at: WaniKaniTimestamp | null;
  readonly completed_at: WaniKaniTimestamp | null;
  readonly created_at: WaniKaniTimestamp;
  readonly level: number;
  readonly passed_at: WaniKaniTimestamp | null;
  readonly started_at: WaniKaniTimestamp | null;
  readonly unlocked_at: WaniKaniTimestamp | null;
}

export interface VoiceActorData {
  readonly created_at: WaniKaniTimestamp;
  readonly description: string;
  readonly gender: 'female' | 'male';
  readonly name: string;
}

export interface ReviewStatisticData {
  readonly created_at: WaniKaniTimestamp;
  readonly hidden: boolean;
  readonly meaning_correct: number;
  readonly meaning_current_streak: number;
  readonly meaning_incorrect: number;
  readonly meaning_max_streak: number;
  readonly percentage_correct: number;
  readonly reading_correct: number;
  readonly reading_current_streak: number;
  readonly reading_incorrect: number;
  readonly reading_max_streak: number;
  readonly subject_id: number;
  readonly subject_type: SubjectObject;
}
