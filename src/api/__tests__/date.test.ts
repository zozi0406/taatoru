import { ApiDecodeError } from '../errors';
import { parseWaniKaniDate } from '../date';

test.each([
  ['2026-07-29T12:34:56Z', '2026-07-29T12:34:56.000Z'],
  ['2026-07-29T12:34:56.123Z', '2026-07-29T12:34:56.123Z'],
  ['2026-07-29T12:34:56.123456Z', '2026-07-29T12:34:56.123Z'],
  ['20260729T12:34:56.123456Z', '2026-07-29T12:34:56.123Z'],
  ['2026-07-29T13:34:56.123+01', '2026-07-29T12:34:56.123Z'],
])('parses WaniKani timestamp %s', (value, expected) => {
  expect(parseWaniKaniDate(value).toISOString()).toBe(expected);
});

test.each([
  'not-a-date',
  '2026-02-29T12:34:56Z',
  '2026-07-29 12:34:56Z',
  '2026-07-29T12:34:56.12Z',
  '2026-0729T12:34:56Z',
  '20260729T123456Z',
])('rejects invalid WaniKani timestamp %s', (value) => {
  expect(() => parseWaniKaniDate(value)).toThrow(ApiDecodeError);
});
