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

import { ApiDecodeError } from './errors';

const WANI_KANI_DATE_PATTERN =
  /^(\d{4}-\d{2}-\d{2}|\d{8})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}|\d{6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

export function parseWaniKaniDate(value: string): Date {
  const match = WANI_KANI_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new ApiDecodeError('Invalid WaniKani timestamp');
  }

  const dateValue = (match[1] ?? '').replaceAll('-', '');
  const yearValue = dateValue.slice(0, 4);
  const monthValue = dateValue.slice(4, 6);
  const dayValue = dateValue.slice(6, 8);
  const hourValue = match[2];
  const minuteValue = match[3];
  const secondValue = match[4];
  const fractionValue = match[5] ?? '';
  const timezoneValue = match[6] ?? 'Z';

  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const millisecond = Number(fractionValue.slice(0, 3).padEnd(3, '0'));

  const localDate = new Date(0);
  localDate.setUTCFullYear(year, month - 1, day);
  localDate.setUTCHours(hour, minute, second, millisecond);

  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() !== month - 1 ||
    localDate.getUTCDate() !== day ||
    localDate.getUTCHours() !== hour ||
    localDate.getUTCMinutes() !== minute ||
    localDate.getUTCSeconds() !== second
  ) {
    throw new ApiDecodeError('Invalid WaniKani timestamp');
  }

  const offsetMinutes = parseTimezoneOffset(timezoneValue);
  return new Date(localDate.getTime() - offsetMinutes * 60_000);
}

function parseTimezoneOffset(value: string): number {
  if (value === 'Z') {
    return 0;
  }

  const sign = value.startsWith('-') ? -1 : 1;
  const digits = value.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, 2));
  const minutes = digits.length === 4 ? Number(digits.slice(2)) : 0;

  if (hours > 23 || minutes > 59) {
    throw new ApiDecodeError('Invalid WaniKani timestamp');
  }

  return sign * (hours * 60 + minutes);
}
