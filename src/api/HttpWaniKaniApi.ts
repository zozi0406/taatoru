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
import { fetchAllPages } from './pagination';
import { RateLimitTracker } from './rateLimit';
import { compareWaniKaniDates, parseWaniKaniDate, replayCursor } from './date';
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
  IdentifiedResource,
  ResetData,
  ProgressReceipt,
  MaterialReceipt,
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
  readonly schedule?: <T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) => Promise<T>;
  readonly onRateLimit?: (budget: RateLimitSnapshot) => Promise<void>;
  readonly signal?: AbortSignal;
}

export class HttpWaniKaniApi implements WaniKaniApi {
  private readonly token: string;
  private readonly fetch: Fetch;
  private readonly baseUrl: string;
  private readonly now: () => number;
  private readonly rateLimitTracker: RateLimitTracker;
  private readonly scheduling: Pick<HttpWaniKaniApiOptions, 'schedule' | 'onRateLimit' | 'signal'>;

  constructor({
    token,
    fetch = globalThis.fetch.bind(globalThis),
    baseUrl = DEFAULT_BASE_URL,
    now = Date.now,
    schedule, onRateLimit, signal,
  }: HttpWaniKaniApiOptions) {
    this.token = token;
    this.fetch = fetch;
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.now = now;
    this.rateLimitTracker = new RateLimitTracker(now);
    this.scheduling = { schedule, onRateLimit, signal };
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
      updated_after: replayCursor(updatedAfter),
    });
    return preserveUpdatedAfter(this.fetchCollection<SubjectData, SubjectObject>(
      url, (object): object is SubjectObject => SUBJECT_OBJECTS.has(object as SubjectObject), signal,
    ), updatedAfter);
  }

  getAssignments(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<AssignmentData, 'assignment'>> {
    const url = this.collectionUrl('assignments', {
      updated_after: replayCursor(updatedAfter),
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
      updated_after: replayCursor(updatedAfter),
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
      updated_after: replayCursor(updatedAfter),
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
      updated_after: replayCursor(updatedAfter),
    });
    return preserveUpdatedAfter(this.fetchCollection<ReviewStatisticData, 'review_statistic'>(
      url, (object): object is 'review_statistic' => object === 'review_statistic', signal,
    ), updatedAfter);
  }

  async getAssignment(id: number, signal?: AbortSignal): Promise<IdentifiedResource<AssignmentData, 'assignment'>> {
    const url = this.url(`assignments/${id}`);
    const response = await this.requestJson(url, { signal });
    const resource = decodeIdentified<AssignmentData, 'assignment'>(response.body, 'assignment', url, response.status);
    if (resource.id !== id) throw new ApiDecodeError('Assignment identity mismatch', { url });
    return resource;
  }

  getResets(updatedAfter: string | null, signal?: AbortSignal): Promise<CollectionPage<ResetData, 'reset'>> {
    return preserveUpdatedAfter(this.fetchCollection<ResetData, 'reset'>(
      this.collectionUrl('resets', { updated_after: replayCursor(updatedAfter) }),
      (object): object is 'reset' => object === 'reset', signal,
    ), updatedAfter);
  }

  async findStudyMaterial(subjectId: number, signal?: AbortSignal): Promise<MaterialReceipt | null> {
    const page = await this.fetchCollection<StudyMaterialData, 'study_material'>(
      this.collectionUrl('study_materials', { subject_ids: String(subjectId) }),
      (object): object is 'study_material' => object === 'study_material', signal,
    );
    if (page.data.some((resource) => resource.data.subject_id !== subjectId) || page.data.length > 1)
      throw new ApiDecodeError('Study material identity mismatch');
    return page.data[0] ?? null;
  }

  async findReviewStatistic(subjectId: number, signal?: AbortSignal): Promise<IdentifiedResource<ReviewStatisticData, 'review_statistic'> | null> {
    const page = await this.fetchCollection<ReviewStatisticData, 'review_statistic'>(
      this.collectionUrl('review_statistics', { subject_ids: String(subjectId) }),
      (object): object is 'review_statistic' => object === 'review_statistic', signal,
    );
    if (page.data.some((resource) => resource.data.subject_id !== subjectId) || page.data.length > 1)
      throw new ApiDecodeError('Review statistic identity mismatch');
    return page.data[0] ?? null;
  }

  async startAssignment(input: StartAssignmentInput): Promise<ProgressReceipt> {
    const body = input.startedAt
      ? { started_at: input.startedAt.toISOString() }
      : {};
    const response = await this.requestWrite(
      this.url(`assignments/${input.assignmentId}/start`),
      'PUT',
      body,
      input.signal,
    );
    const assignment = decodeIdentified<AssignmentData, 'assignment'>(response.body,
      'assignment', this.url(`assignments/${input.assignmentId}/start`), response.status);
    if (assignment.id !== input.assignmentId) throw new ApiDecodeError('Assignment identity mismatch');
    return { assignment };
  }

  async createReview(input: CreateReviewInput): Promise<ProgressReceipt> {
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

    const response = await this.requestWrite(
      this.url('reviews'),
      'POST',
      { review },
      input.signal,
    );
    const body = response.body;
    if (!isRecord(body) || body.object !== 'review' || !isRecord(body.resources_updated))
      throw new ApiDecodeError('Invalid review receipt', { url: this.url('reviews'), status: response.status });
    const assignment = decodeIdentified<AssignmentData, 'assignment'>(body.resources_updated.assignment,
      'assignment', this.url('reviews'), response.status);
    const reviewStatistic = decodeIdentified<ReviewStatisticData, 'review_statistic'>(body.resources_updated.review_statistic,
      'review_statistic', this.url('reviews'), response.status);
    if ((input.assignmentId !== undefined && assignment.id !== input.assignmentId) ||
        (input.subjectId !== undefined && assignment.data.subject_id !== input.subjectId) ||
        reviewStatistic.data.subject_id !== assignment.data.subject_id)
      throw new ApiDecodeError('Review receipt identity mismatch');
    return { assignment, reviewStatistic };
  }

  async upsertStudyMaterial(input: StudyMaterialInput): Promise<MaterialReceipt> {
    const creating = input.studyMaterialId === undefined;
    const studyMaterial = {
      ...(creating ? { subject_id: input.subjectId } : {}),
      meaning_note: input.meaningNote,
      reading_note: input.readingNote,
      meaning_synonyms: input.meaningSynonyms,
    };

    const response = await this.requestWrite(
      creating
        ? this.url('study_materials')
        : this.url(`study_materials/${input.studyMaterialId}`),
      creating ? 'POST' : 'PUT',
      { study_material: studyMaterial },
      input.signal,
    );
    const material = decodeIdentified<StudyMaterialData, 'study_material'>(response.body,
      'study_material', this.url('study_materials'), response.status);
    if (material.data.subject_id !== input.subjectId) throw new ApiDecodeError('Study material identity mismatch');
    return material;
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
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    return this.requestJson(url, { method, body: JSON.stringify(body), signal });
  }

  private async requestJson(
    url: string,
    init: RequestInit,
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    if (this.scheduling.schedule !== undefined) return this.scheduling.schedule(
      (signal) => this.performRequestJson(url, { ...init, signal }), init.signal ?? this.scheduling.signal);
    return this.performRequestJson(url, init);
  }

  private async performRequestJson(url: string, init: RequestInit): Promise<{ readonly body: unknown; readonly status: number }> {
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
    await this.scheduling.onRateLimit?.(this.rateLimit);

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
    data_updated_at: page.data_updated_at === null ? updatedAfter :
      updatedAfter !== null && compareWaniKaniDates(page.data_updated_at, updatedAfter) < 0
        ? updatedAfter : page.data_updated_at,
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
  validateResourceData(body, url, status);
  return body as unknown as Resource<T, TObject>;
}

function decodeIdentified<T, TObject extends WaniKaniObject>(
  body: unknown, object: TObject, url: string, status: number,
): IdentifiedResource<T, TObject> {
  const resource = decodeResource<T, TObject>(body, object, url, status);
  if (!Number.isInteger(resource.id) || (resource.id ?? 0) <= 0)
    throw new ApiDecodeError('Missing resource identity', { url, status });
  return resource as IdentifiedResource<T, TObject>;
}

/** Validate fields used for writes/reconciliation before trusting a receipt. */
function validateResourceData(resource: Record<string, unknown>, url: string, status: number): void {
  const data = resource.data;
  const fail = () => { throw new ApiDecodeError('Invalid WaniKani resource data', { url, status }); };
  if (!isRecord(data)) return fail();
  if (typeof resource.data_updated_at !== 'string') return fail();
  parseWaniKaniDate(resource.data_updated_at);
  const integer = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
  const timestamp = (value: unknown) => {
    if (value === null) return true;
    if (typeof value !== 'string') return false;
    try { parseWaniKaniDate(value); return true; } catch { return false; }
  };
  if (resource.object === 'assignment') {
    if (!integer(data.subject_id) || !integer(data.srs_stage) || Number(data.srs_stage) > 9 ||
        !SUBJECT_OBJECTS.has(data.subject_type as SubjectObject) || typeof data.hidden !== 'boolean' ||
        !['available_at', 'unlocked_at', 'started_at', 'passed_at', 'burned_at', 'resurrected_at']
          .every((field) => timestamp(data[field]))) return fail();
  } else if (resource.object === 'review_statistic') {
    if (!integer(data.subject_id) || typeof data.hidden !== 'boolean' ||
        !['meaning_correct', 'meaning_incorrect', 'reading_correct', 'reading_incorrect']
          .every((field) => integer(data[field]))) return fail();
  } else if (resource.object === 'study_material') {
    if (!integer(data.subject_id) || !Array.isArray(data.meaning_synonyms) ||
        !data.meaning_synonyms.every((value) => typeof value === 'string') ||
        ![data.meaning_note, data.reading_note].every((value) => value === null || typeof value === 'string'))
      return fail();
  } else if (resource.object === 'reset') {
    if (!integer(data.target_level) || Number(data.target_level) < 1 ||
        !integer(data.original_level) || !timestamp(data.confirmed_at)) return fail();
  } else if (resource.object === 'user') {
    if (typeof data.id !== 'string' || !integer(data.level) || !isRecord(data.subscription) ||
        !integer(data.subscription.max_level_granted)) return fail();
  }
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
  for (const resource of body.data) validateResourceData(resource, url, status);
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
