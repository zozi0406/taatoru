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
// Modified by Taatoru from Tsurukame's WaniKaniAPI/APIClient.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type {
  CreateReviewInput,
  RateLimitSnapshot,
  StartAssignmentInput,
  StudyMaterialInput,
  WaniKaniApi,
} from './WaniKaniApi';
import { ApiDecodeError, ApiError, NetworkError } from './errors';
import { fetchAllPages, fetchSpeculativePages } from './pagination';
import { RateLimitTracker } from './rateLimit';
import type {
  AssignmentData,
  CollectionPage,
  LevelProgressionData,
  Resource,
  ReviewStatisticData,
  StudyMaterialData,
  SubjectData,
  SubjectObject,
  UserData,
  VoiceActorData,
  WaniKaniObject,
} from './types';

const DEFAULT_BASE_URL = 'https://api.wanikani.com/v2/';
const SUBJECT_OBJECTS = new Set<SubjectObject>([
  'kana_vocabulary',
  'kanji',
  'radical',
  'vocabulary',
]);

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface HttpWaniKaniApiOptions {
  readonly token: string;
  readonly fetch?: Fetch;
  readonly baseUrl?: string;
  readonly now?: () => number;
}

export class HttpWaniKaniApi implements WaniKaniApi {
  private readonly token: string;
  private readonly fetch: Fetch;
  private readonly baseUrl: string;
  private readonly now: () => number;
  private readonly rateLimitTracker: RateLimitTracker;

  constructor({
    token,
    fetch = globalThis.fetch.bind(globalThis),
    baseUrl = DEFAULT_BASE_URL,
    now = Date.now,
  }: HttpWaniKaniApiOptions) {
    this.token = token;
    this.fetch = fetch;
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.now = now;
    this.rateLimitTracker = new RateLimitTracker(now);
  }

  get rateLimit(): RateLimitSnapshot {
    return this.rateLimitTracker.snapshot;
  }

  async getUser(signal?: AbortSignal): Promise<Resource<UserData, 'user'>> {
    const url = this.url('user');
    const response = await this.requestJson(url, { signal });
    return decodeResource<UserData, 'user'>(
      response.body,
      'user',
      url,
      response.status,
    );
  }

  getSubjects(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<SubjectData, SubjectObject>> {
    const url = this.collectionUrl('subjects', {
      hidden: 'false',
      updated_after: updatedAfter,
    });
    const fetchPage = (pageUrl: string, pageSignal?: AbortSignal) =>
      this.requestCollectionPage<SubjectData, SubjectObject>(
        pageUrl,
        (object): object is SubjectObject =>
          SUBJECT_OBJECTS.has(object as SubjectObject),
        pageSignal,
      );

    return preserveUpdatedAfter(
      updatedAfter === null
        ? fetchSpeculativePages({
            url,
            windows: 9,
            perPage: 1000,
            fetchPage,
            signal,
          })
        : fetchAllPages(url, fetchPage, signal),
      updatedAfter,
    );
  }

  getAssignments(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<AssignmentData, 'assignment'>> {
    const url = this.collectionUrl('assignments', {
      unlocked: 'true',
      hidden: 'false',
      updated_after: updatedAfter,
    });
    return preserveUpdatedAfter(
      this.fetchCollection(
        url,
        (object): object is 'assignment' => object === 'assignment',
        signal,
      ),
      updatedAfter,
    );
  }

  getStudyMaterials(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<StudyMaterialData, 'study_material'>> {
    const url = this.collectionUrl('study_materials', {
      updated_after: updatedAfter,
    });
    return preserveUpdatedAfter(
      this.fetchCollection(
        url,
        (object): object is 'study_material' => object === 'study_material',
        signal,
      ),
      updatedAfter,
    );
  }

  getLevelProgressions(
    signal?: AbortSignal,
  ): Promise<CollectionPage<LevelProgressionData, 'level_progression'>> {
    return this.fetchCollection(
      this.url('level_progressions'),
      (object): object is 'level_progression' =>
        object === 'level_progression',
      signal,
    );
  }

  getVoiceActors(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<VoiceActorData, 'voice_actor'>> {
    const url = this.collectionUrl('voice_actors', {
      updated_after: updatedAfter,
    });
    return preserveUpdatedAfter(
      this.fetchCollection(
        url,
        (object): object is 'voice_actor' => object === 'voice_actor',
        signal,
      ),
      updatedAfter,
    );
  }

  getReviewStatistics(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<ReviewStatisticData, 'review_statistic'>> {
    const url = this.collectionUrl('review_statistics', {
      hidden: 'false',
      updated_after: updatedAfter,
    });
    const fetchPage = (pageUrl: string, pageSignal?: AbortSignal) =>
      this.requestCollectionPage<ReviewStatisticData, 'review_statistic'>(
        pageUrl,
        (object): object is 'review_statistic' =>
          object === 'review_statistic',
        pageSignal,
      );

    return preserveUpdatedAfter(
      updatedAfter === null
        ? fetchSpeculativePages({
            url,
            windows: 9,
            perPage: 1000,
            fetchPage,
            signal,
          })
        : fetchAllPages(url, fetchPage, signal),
      updatedAfter,
    );
  }

  async startAssignment(input: StartAssignmentInput): Promise<void> {
    const body = input.startedAt
      ? { started_at: input.startedAt.toISOString() }
      : {};
    await this.requestWrite(
      this.url(`assignments/${input.assignmentId}/start`),
      'PUT',
      body,
      input.signal,
    );
  }

  async createReview(input: CreateReviewInput): Promise<void> {
    const review = {
      ...(input.assignmentId === undefined
        ? { subject_id: input.subjectId }
        : { assignment_id: input.assignmentId }),
      incorrect_meaning_answers: input.incorrectMeaningAnswers,
      incorrect_reading_answers: input.incorrectReadingAnswers,
      ...(input.createdAt === undefined
        ? {}
        : { created_at: input.createdAt.toISOString() }),
    };

    await this.requestWrite(
      this.url('reviews'),
      'POST',
      { review },
      input.signal,
    );
  }

  async upsertStudyMaterial(input: StudyMaterialInput): Promise<void> {
    const creating = input.studyMaterialId === undefined;
    const studyMaterial = {
      ...(creating ? { subject_id: input.subjectId } : {}),
      meaning_note: input.meaningNote,
      reading_note: input.readingNote,
      meaning_synonyms: input.meaningSynonyms,
    };

    await this.requestWrite(
      creating
        ? this.url('study_materials')
        : this.url(`study_materials/${input.studyMaterialId}`),
      creating ? 'POST' : 'PUT',
      { study_material: studyMaterial },
      input.signal,
    );
  }

  private fetchCollection<T, TObject extends WaniKaniObject>(
    url: string,
    acceptsObject: (object: WaniKaniObject) => object is TObject,
    signal?: AbortSignal,
  ): Promise<CollectionPage<T, TObject>> {
    return fetchAllPages(
      url,
      (pageUrl, pageSignal) =>
        this.requestCollectionPage(
          pageUrl,
          acceptsObject,
          pageSignal,
        ),
      signal,
    );
  }

  private async requestCollectionPage<T, TObject extends WaniKaniObject>(
    url: string,
    acceptsObject: (object: WaniKaniObject) => object is TObject,
    signal?: AbortSignal,
  ): Promise<CollectionPage<T, TObject>> {
    const response = await this.requestJson(url, { signal });
    return decodeCollectionPage<T, TObject>(
      response.body,
      acceptsObject,
      url,
      response.status,
    );
  }

  private async requestWrite(
    url: string,
    method: 'POST' | 'PUT',
    body: object,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.request(url, {
      method,
      body: JSON.stringify(body),
      signal,
    });
  }

  private async requestJson(
    url: string,
    init: RequestInit,
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    const response = await this.request(url, init);
    try {
      return {
        body: await response.json(),
        status: response.status,
      };
    } catch (cause) {
      throw new ApiDecodeError('Could not decode the WaniKani response', {
        status: response.status,
        url,
        cause,
      });
    }
  }

  private async request(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const requestStartedAtMs = this.now();
    let response: Response;
    try {
      response = await this.fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json; charset=utf-8',
          'Wanikani-Revision': '20170710',
        },
      });
    } catch (cause) {
      if (isAbortError(cause)) {
        throw cause;
      }
      throw new NetworkError('Could not reach WaniKani', {
        url,
        cause,
      });
    }

    const responseReceivedAtMs = this.now();
    this.rateLimitTracker.recordResponse({
      serverDate: response.headers.get('Date'),
      rateLimitLimit: response.headers.get('RateLimit-Limit'),
      rateLimitRemaining: response.headers.get('RateLimit-Remaining'),
      rateLimitReset: response.headers.get('RateLimit-Reset'),
      requestStartedAtMs,
      responseReceivedAtMs,
    });

    if (response.status === 200 || response.status === 201) {
      return response;
    }

    const body = await readErrorBody(response);
    const message =
      body?.error ?? `WaniKani request failed with status ${response.status}`;
    throw new ApiError(message, {
      status: response.status,
      url,
      retryAt: parseRetryAt(
        response.headers.get('Retry-After'),
        responseReceivedAtMs,
      ) ??
        (response.status === 429
          ? parseRateLimitReset(response.headers.get('RateLimit-Reset'))
          : undefined),
    });
  }

  private url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  private collectionUrl(
    path: string,
    query: Readonly<Record<string, string | null>>,
  ): string {
    const url = new URL(path, this.baseUrl);
    for (const [name, value] of Object.entries(query)) {
      if (value !== null) {
        url.searchParams.append(name, value);
      }
    }
    return url.toString();
  }
}

async function preserveUpdatedAfter<
  T,
  TObject extends WaniKaniObject,
>(
  pagePromise: Promise<CollectionPage<T, TObject>>,
  updatedAfter: string | null,
): Promise<CollectionPage<T, TObject>> {
  const page = await pagePromise;
  return {
    ...page,
    data_updated_at: page.data_updated_at ?? updatedAfter,
  };
}

function decodeResource<T, TObject extends WaniKaniObject>(
  body: unknown,
  expectedObject: TObject,
  url: string,
  status: number,
): Resource<T, TObject> {
  if (
    !isRecord(body) ||
    body.object !== expectedObject ||
    typeof body.url !== 'string' ||
    typeof body.data_updated_at !== 'string' ||
    !('data' in body)
  ) {
    throw new ApiDecodeError('Invalid WaniKani resource envelope', {
      status,
      url,
    });
  }
  return body as unknown as Resource<T, TObject>;
}

function decodeCollectionPage<T, TObject extends WaniKaniObject>(
  body: unknown,
  acceptsObject: (object: WaniKaniObject) => object is TObject,
  url: string,
  status: number,
): CollectionPage<T, TObject> {
  if (
    !isRecord(body) ||
    body.object !== 'collection' ||
    typeof body.url !== 'string' ||
    !isRecord(body.pages) ||
    !isNullableString(body.pages.next_url) ||
    !isNullableString(body.pages.previous_url) ||
    typeof body.pages.per_page !== 'number' ||
    typeof body.total_count !== 'number' ||
    !isNullableString(body.data_updated_at) ||
    !Array.isArray(body.data) ||
    !body.data.every(
      (resource) =>
        isRecord(resource) &&
        typeof resource.id === 'number' &&
        typeof resource.object === 'string' &&
        acceptsObject(resource.object as WaniKaniObject) &&
        typeof resource.url === 'string' &&
        typeof resource.data_updated_at === 'string' &&
        'data' in resource,
    )
  ) {
    throw new ApiDecodeError('Invalid WaniKani collection envelope', {
      status,
      url,
    });
  }
  return body as unknown as CollectionPage<T, TObject>;
}

async function readErrorBody(
  response: Response,
): Promise<{ readonly error: string; readonly code: number } | null> {
  try {
    const body: unknown = await response.json();
    if (
      isRecord(body) &&
      typeof body.error === 'string' &&
      typeof body.code === 'number'
    ) {
      return { error: body.error, code: body.code };
    }
  } catch {
    //
  }
  return null;
}

function parseRetryAt(value: string | null, now: number): Date | undefined {
  if (value === null) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(now + seconds * 1000);
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

function parseRateLimitReset(value: string | null): Date | undefined {
  if (value === null) {
    return undefined;
  }

  const epochSeconds = Number(value);
  return Number.isFinite(epochSeconds) && epochSeconds >= 0
    ? new Date(epochSeconds * 1000)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isAbortError(value: unknown): boolean {
  return isRecord(value) && value.name === 'AbortError';
}
