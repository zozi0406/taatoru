import { damerauLevenshtein } from '../levenshtein';

test('counts insertion, deletion, substitution, and transposition', () => {
  expect(damerauLevenshtein('', 'one')).toBe(3);
  expect(damerauLevenshtein('one', 'on')).toBe(1);
  expect(damerauLevenshtein('one', 'owe')).toBe(1);
  expect(damerauLevenshtein('one', 'oen')).toBe(1);
});
