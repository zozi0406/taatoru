import { ApiDecodeError } from '../errors';
import { fetchAllPages } from '../pagination';
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

test('keeps the first watermark when an early record changes during later page reads', async () => {
  const fetchPage = jest.fn()
    .mockResolvedValueOnce({ ...collectionPage([resource(1)], 'https://api.wanikani.com/v2/assignments?page_after_id=1'),
      data_updated_at: '2026-10-24T10:00:00.123456Z' })
    .mockResolvedValueOnce({ ...collectionPage([resource(2)]),
      data_updated_at: '2026-10-24T10:01:00.000000Z' });
  const result = await fetchAllPages('https://api.wanikani.com/v2/assignments', fetchPage);
  expect(result.data_updated_at).toBe('2026-10-24T10:00:00.123456Z');
});

test('keeps the newest duplicate resource while preserving deterministic order', async () => {
  const older = { ...resource(1), data_updated_at: '2026-10-24T10:00:00.123455Z' };
  const newer = { ...resource(1), data_updated_at: '2026-10-24T10:00:00.123456Z' };
  const fetchPage = jest.fn()
    .mockResolvedValueOnce(collectionPage([older, resource(2)], 'https://api.wanikani.com/v2/assignments?page_after_id=2'))
    .mockResolvedValueOnce(collectionPage([newer]));
  const result = await fetchAllPages('https://api.wanikani.com/v2/assignments', fetchPage);
  expect(result.data.map(({ id }) => id)).toEqual([1, 2]);
  expect(result.data[0]?.data_updated_at).toBe('2026-10-24T10:00:00.123456Z');
});
