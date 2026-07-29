import type { SubjectResource } from '@/api/types';

export type ReviewPrompt = 'meaning' | 'reading';

export type RetryReason =
  | 'close-answer'
  | 'invalid-characters'
  | 'meaning-instead-of-reading'
  | 'mismatching-okurigana'
  | 'other-kanji-reading'
  | 'reading-instead-of-meaning';

export type AnswerResult =
  | { readonly verdict: 'correct'; readonly matched: string }
  | { readonly verdict: 'retry'; readonly reason: RetryReason }
  | {
      readonly verdict: 'incorrect';
      readonly expected: readonly string[];
    };

export interface CheckAnswerInput {
  readonly answer: string;
  readonly exactMatch?: boolean;
  readonly meaningSynonyms?: readonly string[];
  readonly prompt: ReviewPrompt;
  readonly subject: SubjectResource;
}
