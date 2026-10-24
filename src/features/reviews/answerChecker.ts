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
// Modified by Taatoru from Tsurukame's AnswerChecker.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import { romajiToKana } from '@/features/search/kana';
import { damerauLevenshtein } from './levenshtein';
import type { AnswerResult, CheckAnswerInput, ReviewPrompt } from './types';

const JAPANESE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/u;
const KANA_ONLY = /^[\u3040-\u30ff\u31f0-\u31ffー]+$/u;
const HIRAGANA_SUFFIX = /[\u3040-\u309fー]+$/u;

export function checkAnswer(input: CheckAnswerInput): AnswerResult {
  return input.prompt === 'meaning' ? checkMeaning(input) : checkReading(input);
}

export function normalizeAnswer(value: string, prompt: ReviewPrompt): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replaceAll('-', prompt === 'reading' ? '-' : ' ')
    .replaceAll('.', '')
    .replaceAll("'", '')
    .replaceAll('/', '');
  return prompt === 'reading' ? normalized.replaceAll(' ', '') : normalized;
}

export function katakanaToHiragana(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint >= 0x30a1 && codePoint <= 0x30f6
        ? String.fromCodePoint(codePoint - 0x60)
        : character;
    })
    .join('');
}

function checkMeaning(input: CheckAnswerInput): AnswerResult {
  const answer = normalizeAnswer(input.answer, 'meaning');
  const accepted = acceptedMeanings(input);
  if (JAPANESE.test(answer)) {
    return { verdict: 'retry', reason: 'invalid-characters' };
  }
  const forbidden = input.subject.data.auxiliary_meanings
    .filter(({ type }) => type === 'blacklist')
    .map(({ meaning }) => meaning);
  if (
    forbidden.some((meaning) => normalizeAnswer(meaning, 'meaning') === answer)
  ) {
    return { verdict: 'incorrect', expected: accepted };
  }
  const precise = accepted.find(
    (meaning) => normalizeAnswer(meaning, 'meaning') === answer,
  );
  if (precise !== undefined) {
    return { verdict: 'correct', matched: precise };
  }
  const close = accepted.find((meaning) => {
    const normalized = normalizeAnswer(meaning, 'meaning');
    return (
      damerauLevenshtein(normalized, answer) <= distanceTolerance(normalized)
    );
  });
  if (close !== undefined) {
    return input.exactMatch
      ? { verdict: 'retry', reason: 'close-answer' }
      : { verdict: 'correct', matched: close };
  }
  const readingResult = checkReading({ ...input, prompt: 'reading' });
  if (readingResult.verdict === 'correct') {
    return { verdict: 'retry', reason: 'reading-instead-of-meaning' };
  }
  if (
    readingResult.verdict === 'retry' &&
    readingResult.reason === 'other-kanji-reading'
  ) {
    return readingResult;
  }
  return { verdict: 'incorrect', expected: accepted };
}

function checkReading(input: CheckAnswerInput): AnswerResult {
  const meaningMatch = acceptedMeanings(input).some(
    (meaning) =>
      normalizeAnswer(meaning, 'meaning') ===
      normalizeAnswer(input.answer, 'meaning'),
  );
  if (meaningMatch) {
    return { verdict: 'retry', reason: 'meaning-instead-of-reading' };
  }
  const converted = readingText(input.answer);
  if (converted === null || !KANA_ONLY.test(converted)) {
    return { verdict: 'retry', reason: 'invalid-characters' };
  }
  const accepted = acceptedReadings(input);
  const precise = accepted.find(
    (reading) => katakanaToHiragana(reading) === converted,
  );
  if (precise !== undefined) {
    return { verdict: 'correct', matched: precise };
  }
  if ('readings' in input.subject.data && input.subject.object === 'kanji') {
    const alternate = input.subject.data.readings
      .filter(({ accepted_answer }) => !accepted_answer)
      .find(({ reading }) => katakanaToHiragana(reading) === converted);
    if (alternate !== undefined) {
      return { verdict: 'retry', reason: 'other-kanji-reading' };
    }
  }
  if (
    (input.subject.object === 'vocabulary' ||
      input.subject.object === 'kana_vocabulary') &&
    hasMismatchingOkurigana(input.subject.data.characters, converted)
  ) {
    return { verdict: 'retry', reason: 'mismatching-okurigana' };
  }
  return { verdict: 'incorrect', expected: accepted };
}

function acceptedMeanings(input: CheckAnswerInput): readonly string[] {
  return [
    ...input.subject.data.meanings
      .filter(({ accepted_answer }) => accepted_answer)
      .map(({ meaning }) => meaning),
    ...input.subject.data.auxiliary_meanings
      .filter(({ type }) => type === 'whitelist')
      .map(({ meaning }) => meaning),
    ...(input.meaningSynonyms ?? []),
  ];
}

function acceptedReadings(input: CheckAnswerInput): readonly string[] {
  if ('readings' in input.subject.data) {
    return input.subject.data.readings
      .filter(({ accepted_answer }) => accepted_answer)
      .map(({ reading }) => reading);
  }
  return input.subject.data.characters === null
    ? []
    : [input.subject.data.characters];
}

function readingText(value: string): string | null {
  const normalized = normalizeAnswer(value, 'reading');
  if (KANA_ONLY.test(normalized)) {
    return katakanaToHiragana(normalized);
  }
  const conversion = romajiToKana(normalized);
  return conversion.complete ? katakanaToHiragana(conversion.text) : null;
}

function distanceTolerance(answer: string): number {
  const length = [...answer].length;
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 7) return 2;
  return 2 + Math.floor(length / 7);
}

function hasMismatchingOkurigana(
  characters: string | null,
  answer: string,
): boolean {
  const suffix = characters?.match(HIRAGANA_SUFFIX)?.[0];
  if (suffix === undefined || [...answer].length < [...characters!].length) {
    return false;
  }
  return !answer.endsWith(katakanaToHiragana(suffix));
}
