// Copyright 2018 David Sansome
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
// Modified by Taatoru from Tsurukame's
// Extensions/NSString+LevenshteinDistance.m at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

export function damerauLevenshtein(left: string, right: string): number {
  const first = [...left];
  const second = [...right];
  if (first.length === 0) return second.length;
  if (second.length === 0) return first.length;

  const width = first.length + 1;
  const distance = Array.from(
    { length: second.length + 1 },
    (_, row) =>
      Array.from({ length: width }, (_, column) =>
        row === 0 ? column : column === 0 ? row : 0,
      ),
  );
  for (let row = 1; row <= second.length; row += 1) {
    for (let column = 1; column <= first.length; column += 1) {
      const cost = first[column - 1] === second[row - 1] ? 0 : 1;
      distance[row]![column] = Math.min(
        distance[row - 1]![column]! + 1,
        distance[row]![column - 1]! + 1,
        distance[row - 1]![column - 1]! + cost,
      );
      if (
        row > 1 &&
        column > 1 &&
        first[column - 1] === second[row - 2] &&
        first[column - 2] === second[row - 1]
      ) {
        distance[row]![column] = Math.min(
          distance[row]![column]!,
          distance[row - 2]![column - 2]! + cost,
        );
      }
    }
  }
  return distance[second.length]![first.length]!;
}
