import {
  assignmentFixture,
  collectionPage,
  kanjiFixture,
  userFixture,
} from '../../fixtures/api';
import { ApiDecodeError, ApiError } from '../errors';
import { HttpWaniKaniApi } from '../HttpWaniKaniApi';

function jsonResponse(
  body: unknown,
  {
    status = 200,
    headers = {},
  }: {
    readonly status?: number;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

test('sends documented authentication and revision headers', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse(userFixture));
  const api = new HttpWaniKaniApi({ token: 'secret', fetch });

  await api.getUser();

  expect(fetch).toHaveBeenCalledWith(
    'https://api.wanikani.com/v2/user',
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer secret',
        'Wanikani-Revision': '20170710',
      }),
    }),
  );
});

test('updates its public budget from server rate-limit headers', async () => {
  const fetch = jest.fn().mockResolvedValue(
    jsonResponse(userFixture, {
      headers: {
        Date: 'Thu, 01 Jan 1970 00:00:10 GMT',
        'RateLimit-Limit': '120',
        'RateLimit-Remaining': '17',
        'RateLimit-Reset': '20',
      },
    }),
  );
  const api = new HttpWaniKaniApi({
    token: 'secret',
    fetch,
    now: () => 10_000,
  });

  await api.getUser();

  expect(api.rateLimit).toMatchObject({
    limit: 120,
    requestsInServerMinute: 103,
    requestsRemaining: 17,
  });
});

test('applies Tsurukame collection filters without losing the update cursor', async () => {
  const fetch = jest
    .fn()
    .mockResolvedValue(jsonResponse(collectionPage([assignmentFixture])));
  const api = new HttpWaniKaniApi({ token: 'secret', fetch });

  await api.getAssignments('2026-07-29T12:34:56.123456Z');

  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://api.wanikani.com/v2/assignments?unlocked=true&hidden=false&updated_after=2026-07-29T12%3A34%3A56.123456Z',
  );
});

test('preserves the prior cursor when incremental collections are empty', async () => {
  const fetch = jest
    .fn()
    .mockImplementation(async () => jsonResponse(collectionPage([])));
  const api = new HttpWaniKaniApi({ token: 'secret', fetch });
  const cursor = '2026-07-29T12:34:56.123456Z';

  const pages = await Promise.all([
    api.getSubjects(cursor),
    api.getAssignments(cursor),
    api.getStudyMaterials(cursor),
    api.getVoiceActors(cursor),
    api.getReviewStatistics(cursor),
  ]);

  expect(pages.map(({ data_updated_at: updatedAt }) => updatedAt)).toEqual([
    cursor,
    cursor,
    cursor,
    cursor,
    cursor,
  ]);
});

test('decodes structured rate-limit errors without retaining query data', async () => {
  const fetch = jest.fn().mockResolvedValue(
    jsonResponse(
      {
        error: 'Rate limit exceeded',
        code: 429,
      },
      {
        status: 429,
        headers: {
          'RateLimit-Limit': '60',
          'RateLimit-Remaining': '0',
          'RateLimit-Reset': '99',
          'Retry-After': '30',
        },
      },
    ),
  );
  const api = new HttpWaniKaniApi({
    token: 'secret',
    fetch,
    now: () => 1_000,
  });

  const error = await api
    .getAssignments('private-cursor')
    .catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    message: 'Rate limit exceeded',
    status: 429,
    safeUrl: 'https://api.wanikani.com/v2/assignments',
    isHibernating: false,
  });
  expect((error as ApiError).retryAt?.getTime()).toBe(31_000);
  expect(api.rateLimit).toMatchObject({
    limit: 60,
    requestsRemaining: 0,
  });
});

test('uses RateLimit-Reset when a rate-limit response omits Retry-After', async () => {
  const fetch = jest.fn().mockResolvedValue(
    jsonResponse(
      {
        error: 'Rate limit exceeded',
        code: 429,
      },
      {
        status: 429,
        headers: { 'RateLimit-Reset': '31' },
      },
    ),
  );
  const api = new HttpWaniKaniApi({
    token: 'secret',
    fetch,
    now: () => 1_000,
  });

  const error = await api.getUser().catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).retryAt?.getTime()).toBe(31_000);
});

test('rejects malformed successful envelopes as decode errors', async () => {
  const fetch = jest.fn().mockResolvedValue(jsonResponse({ data: [] }));
  const api = new HttpWaniKaniApi({ token: 'secret', fetch });

  const error = await api.getUser().catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ApiDecodeError);
  expect(error).toMatchObject({
    status: 200,
    safeUrl: 'https://api.wanikani.com/v2/user',
  });
});

test('serializes assignment, review, and study-material writes', async () => {
  const fetch = jest
    .fn()
    .mockResolvedValue(jsonResponse({}))
    .mockResolvedValue(jsonResponse({}))
    .mockResolvedValue(jsonResponse({}));
  const api = new HttpWaniKaniApi({ token: 'secret', fetch });

  await api.startAssignment({
    assignmentId: assignmentFixture.id,
    startedAt: new Date('2026-07-29T12:34:56.000Z'),
  });
  await api.createReview({
    assignmentId: assignmentFixture.id,
    incorrectMeaningAnswers: 1,
    incorrectReadingAnswers: 2,
  });
  await api.upsertStudyMaterial({
    subjectId: kanjiFixture.id,
    studyMaterialId: 601,
    meaningNote: 'Single',
    readingNote: null,
    meaningSynonyms: ['One'],
  });

  expect(fetch.mock.calls).toEqual([
    [
      `https://api.wanikani.com/v2/assignments/${assignmentFixture.id}/start`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          started_at: '2026-07-29T12:34:56.000Z',
        }),
      }),
    ],
    [
      'https://api.wanikani.com/v2/reviews',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          review: {
            assignment_id: assignmentFixture.id,
            incorrect_meaning_answers: 1,
            incorrect_reading_answers: 2,
          },
        }),
      }),
    ],
    [
      'https://api.wanikani.com/v2/study_materials/601',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          study_material: {
            meaning_note: 'Single',
            reading_note: null,
            meaning_synonyms: ['One'],
          },
        }),
      }),
    ],
  ]);
});
