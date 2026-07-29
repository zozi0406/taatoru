import { ApiDecodeError } from '../errors';
import { fetchAllPages, fetchSpeculativePages } from '../pagination';
import type { IdentifiedResource } from '../types';
import { collectionPage } from '../../fixtures/api';

interface FixtureData {
  readonly value: string;
}

function resource(id: number): IdentifiedResource<FixtureData, 'assignment'> {
  return {
    id,
    object: 'assignment',
    url: `https://api.wanikani.com/v2/assignments/${id}`,
    data_updated_at: '2026-07-29T12:34:56.000000Z',
    data: { value: `resource-${id}` },
  };
}

test('advances through every next_url before returning', async () => {
  const fetchPage = jest
    .fn()
    .mockResolvedValueOnce(
      collectionPage(
        [resource(1)],
        'https://api.wanikani.com/v2/assignments?page_after_id=1',
      ),
    )
    .mockResolvedValueOnce(collectionPage([resource(2)]));

  const result = await fetchAllPages(
    'https://api.wanikani.com/v2/assignments',
    fetchPage,
  );

  expect(result.data.map(({ id }) => id)).toEqual([1, 2]);
  expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
    'https://api.wanikani.com/v2/assignments',
    'https://api.wanikani.com/v2/assignments?page_after_id=1',
  ]);
});

test('rejects a repeated next_url instead of looping forever', async () => {
  const repeatedUrl =
    'https://api.wanikani.com/v2/assignments?page_after_id=1';
  const fetchPage = jest
    .fn()
    .mockResolvedValueOnce(collectionPage([resource(1)], repeatedUrl))
    .mockResolvedValueOnce(collectionPage([resource(2)], repeatedUrl));

  await expect(
    fetchAllPages('https://api.wanikani.com/v2/assignments', fetchPage),
  ).rejects.toBeInstanceOf(ApiDecodeError);
});

test('keeps speculative windows ordered and deduplicates resource ids', async () => {
  const fetchPage = jest
    .fn()
    .mockResolvedValueOnce(collectionPage([resource(1), resource(2)]))
    .mockResolvedValueOnce(collectionPage([resource(2), resource(3)]))
    .mockResolvedValueOnce(collectionPage([resource(4)]));

  const result = await fetchSpeculativePages({
    url: 'https://api.wanikani.com/v2/assignments?hidden=false',
    windows: 3,
    perPage: 2,
    fetchPage,
  });

  expect(result.data.map(({ id }) => id)).toEqual([1, 2, 3, 4]);
  expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
    'https://api.wanikani.com/v2/assignments?hidden=false&page_after_id=-1',
    'https://api.wanikani.com/v2/assignments?hidden=false&page_after_id=1',
    'https://api.wanikani.com/v2/assignments?hidden=false&page_after_id=3',
  ]);
});

test('aborts sibling speculative requests when one page fails', async () => {
  const failure = new Error('page failed');
  let siblingAborted = false;
  const fetchPage = jest.fn(
    (_url: string, signal?: AbortSignal): Promise<ReturnType<typeof collectionPage>> => {
      if (fetchPage.mock.calls.length === 2) {
        return Promise.reject(failure);
      }

      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          siblingAborted = true;
          reject(new Error('aborted'));
        });
      });
    },
  );

  await expect(
    fetchSpeculativePages({
      url: 'https://api.wanikani.com/v2/assignments',
      windows: 2,
      perPage: 1000,
      fetchPage,
    }),
  ).rejects.toBe(failure);
  expect(siblingAborted).toBe(true);
});
