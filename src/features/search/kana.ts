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
// Modified by Taatoru from Tsurukame's TKMKanaInput.m at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

export interface KanaConversion {
  readonly text: string;
  readonly complete: boolean;
}

const REPLACEMENTS: Readonly<Record<string, string>> = {
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
  ka: 'か',
  ki: 'き',
  ku: 'く',
  ke: 'け',
  ko: 'こ',
  ca: 'か',
  ci: 'き',
  cu: 'く',
  ce: 'け',
  co: 'こ',
  sa: 'さ',
  shi: 'し',
  si: 'し',
  su: 'す',
  se: 'せ',
  so: 'そ',
  ta: 'た',
  chi: 'ち',
  ti: 'ち',
  tsu: 'つ',
  tu: 'つ',
  te: 'て',
  to: 'と',
  na: 'な',
  ni: 'に',
  nu: 'ぬ',
  ne: 'ね',
  no: 'の',
  ha: 'は',
  hi: 'ひ',
  fu: 'ふ',
  hu: 'ふ',
  he: 'へ',
  ho: 'ほ',
  ma: 'ま',
  mi: 'み',
  mu: 'む',
  me: 'め',
  mo: 'も',
  ya: 'や',
  yu: 'ゆ',
  yo: 'よ',
  ra: 'ら',
  ri: 'り',
  ru: 'る',
  re: 'れ',
  ro: 'ろ',
  wa: 'わ',
  wi: 'うぃ',
  we: 'うぇ',
  wo: 'を',
  ga: 'が',
  gi: 'ぎ',
  gu: 'ぐ',
  ge: 'げ',
  go: 'ご',
  za: 'ざ',
  ji: 'じ',
  zi: 'じ',
  zu: 'ず',
  ze: 'ぜ',
  zo: 'ぞ',
  da: 'だ',
  di: 'ぢ',
  du: 'づ',
  de: 'で',
  do: 'ど',
  ba: 'ば',
  bi: 'び',
  bu: 'ぶ',
  be: 'べ',
  bo: 'ぼ',
  pa: 'ぱ',
  pi: 'ぴ',
  pu: 'ぷ',
  pe: 'ぺ',
  po: 'ぽ',
  kya: 'きゃ',
  kyu: 'きゅ',
  kyo: 'きょ',
  kye: 'きぇ',
  kyi: 'きぃ',
  sha: 'しゃ',
  shu: 'しゅ',
  sho: 'しょ',
  sya: 'しゃ',
  syu: 'しゅ',
  syo: 'しょ',
  sye: 'しぇ',
  syi: 'しぃ',
  cha: 'ちゃ',
  chu: 'ちゅ',
  cho: 'ちょ',
  cya: 'ちゃ',
  cyu: 'ちゅ',
  cyo: 'ちょ',
  cye: 'ちぇ',
  cyi: 'ちぃ',
  chya: 'ちゃ',
  chyu: 'ちゅ',
  chyo: 'ちょ',
  chye: 'ちぇ',
  nya: 'にゃ',
  nyu: 'にゅ',
  nyo: 'にょ',
  nye: 'にぇ',
  nyi: 'にぃ',
  hya: 'ひゃ',
  hyu: 'ひゅ',
  hyo: 'ひょ',
  hye: 'ひぇ',
  hyi: 'ひぃ',
  mya: 'みゃ',
  myu: 'みゅ',
  myo: 'みょ',
  mye: 'みぇ',
  myi: 'みぃ',
  rya: 'りゃ',
  ryu: 'りゅ',
  ryo: 'りょ',
  rye: 'りぇ',
  ryi: 'りぃ',
  gya: 'ぎゃ',
  gyu: 'ぎゅ',
  gyo: 'ぎょ',
  gye: 'ぎぇ',
  gyi: 'ぎぃ',
  ja: 'じゃ',
  ju: 'じゅ',
  jo: 'じょ',
  jya: 'じゃ',
  jyu: 'じゅ',
  jyo: 'じょ',
  jye: 'じぇ',
  jyi: 'じぃ',
  bya: 'びゃ',
  byu: 'びゅ',
  byo: 'びょ',
  bye: 'びぇ',
  byi: 'びぃ',
  pya: 'ぴゃ',
  pyu: 'ぴゅ',
  pyo: 'ぴょ',
  pye: 'ぴぇ',
  pyi: 'ぴぃ',
  fa: 'ふぁ',
  fi: 'ふぃ',
  fe: 'ふぇ',
  fo: 'ふぉ',
  fwa: 'ふぁ',
  fwi: 'ふぃ',
  fwu: 'ふぅ',
  fwe: 'ふぇ',
  fwo: 'ふぉ',
  fya: 'ふゃ',
  fyi: 'ふぃ',
  fyu: 'ふゅ',
  fye: 'ふぇ',
  fyo: 'ふょ',
  va: 'ゔぁ',
  vi: 'ゔぃ',
  vu: 'ゔ',
  ve: 'ゔぇ',
  vo: 'ゔぉ',
  vya: 'ゔゃ',
  vyi: 'ゔぃ',
  vyu: 'ゔゅ',
  vye: 'ゔぇ',
  vyo: 'ゔょ',
  she: 'しぇ',
  che: 'ちぇ',
  je: 'じぇ',
  tsa: 'つぁ',
  tsi: 'つぃ',
  tse: 'つぇ',
  tso: 'つぉ',
  tha: 'てゃ',
  thi: 'てぃ',
  thu: 'てゅ',
  the: 'てぇ',
  tho: 'てょ',
  dha: 'でゃ',
  dhi: 'でぃ',
  dhu: 'でゅ',
  dhe: 'でぇ',
  dho: 'でょ',
  dwa: 'どぁ',
  dwi: 'どぃ',
  dwu: 'どぅ',
  dwe: 'どぇ',
  dwo: 'どぉ',
  dya: 'ぢゃ',
  dyi: 'ぢぃ',
  dyu: 'ぢゅ',
  dye: 'ぢぇ',
  dyo: 'ぢょ',
  kwa: 'くぁ',
  gwa: 'ぐぁ',
  gwi: 'ぐぃ',
  gwu: 'ぐぅ',
  gwe: 'ぐぇ',
  gwo: 'ぐぉ',
  qa: 'くぁ',
  qi: 'くぃ',
  qe: 'くぇ',
  qo: 'くぉ',
  qwa: 'くぁ',
  qwi: 'くぃ',
  qwu: 'くぅ',
  qwe: 'くぇ',
  qwo: 'くぉ',
  qya: 'くゃ',
  qyi: 'くぃ',
  qyu: 'くゅ',
  qye: 'くぇ',
  qyo: 'くょ',
  swa: 'すぁ',
  swi: 'すぃ',
  swu: 'すぅ',
  swe: 'すぇ',
  swo: 'すぉ',
  twa: 'とぁ',
  twi: 'とぃ',
  twu: 'とぅ',
  twe: 'とぇ',
  two: 'とぉ',
  tya: 'ちゃ',
  tyi: 'ちぃ',
  tyu: 'ちゅ',
  tye: 'ちぇ',
  tyo: 'ちょ',
  wha: 'うぁ',
  whi: 'うぃ',
  whe: 'うぇ',
  who: 'うぉ',
  wu: 'う',
  yi: 'い',
  ye: 'いぇ',
  xa: 'ぁ',
  xi: 'ぃ',
  xu: 'ぅ',
  xe: 'ぇ',
  xo: 'ぉ',
  xya: 'ゃ',
  xyu: 'ゅ',
  xyo: 'ょ',
  xyi: 'ぃ',
  xye: 'ぇ',
  xwa: 'ゎ',
  xka: 'ヵ',
  xke: 'ヶ',
  xca: 'ヵ',
  xce: 'ヶ',
  xn: 'ん',
  xtu: 'っ',
  xtsu: 'っ',
  la: 'ぁ',
  li: 'ぃ',
  lu: 'ぅ',
  le: 'ぇ',
  lo: 'ぉ',
  lya: 'ゃ',
  lyu: 'ゅ',
  lyo: 'ょ',
  lyi: 'ぃ',
  lye: 'ぇ',
  lwe: 'ゎ',
  lka: 'ヵ',
  lke: 'ヶ',
  lca: 'ヵ',
  lce: 'ヶ',
  ltu: 'っ',
  ltsu: 'っ',
  zya: 'じゃ',
  zyi: 'じぃ',
  zyu: 'じゅ',
  zye: 'じぇ',
  zyo: 'じょ',
  '-': 'ー',
};

const ASCII_LETTER = /^[a-z]$/;
const CONSONANT = /^[bcdfghjklmnpqrstvwxyz]$/;

export function romajiToKana(input: string): KanaConversion {
  const normalized = input.toLowerCase().normalize('NFKC');
  let text = '';
  let complete = true;
  let index = 0;

  while (index < normalized.length) {
    const current = normalized[index]!;
    const next = normalized[index + 1];
    if (
      next !== undefined &&
      current === next &&
      current !== 'n' &&
      CONSONANT.test(current)
    ) {
      text += 'っ';
      index += 1;
      continue;
    }
    if (
      (current === 'n' || current === 'm') &&
      (next === undefined ||
        next === "'" ||
        (current === 'm' && /[bmp]/.test(next)) ||
        !/[aiueoy]/.test(next))
    ) {
      text += 'ん';
      index += next === "'" ? 2 : 1;
      continue;
    }

    let replacement: string | undefined;
    let replacementLength = 0;
    for (let length = 4; length >= 1; length -= 1) {
      const candidate = normalized.slice(index, index + length);
      if (REPLACEMENTS[candidate] !== undefined) {
        replacement = REPLACEMENTS[candidate];
        replacementLength = length;
        break;
      }
    }
    if (replacement !== undefined) {
      text += replacement;
      index += replacementLength;
      continue;
    }

    text += current;
    if (ASCII_LETTER.test(current)) {
      complete = false;
    }
    index += 1;
  }

  return { text, complete };
}
