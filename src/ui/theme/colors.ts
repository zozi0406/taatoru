export interface ThemeColors {
  readonly accent: string;
  readonly accentForeground: string;
  readonly accentSurface: string;
  readonly border: string;
  readonly canvas: string;
  readonly danger: string;
  readonly dangerSurface: string;
  readonly focus: string;
  readonly success: string;
  readonly successSurface: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly text: string;
  readonly textMuted: string;
}

export const lightColors: ThemeColors = {
  accent: '#174E52',
  accentForeground: '#FFFFFF',
  accentSurface: '#E2EDEC',
  border: '#D9DFD8',
  canvas: '#F7F4ED',
  danger: '#B42318',
  dangerSurface: '#FEECEB',
  focus: '#174E52',
  success: '#17745C',
  successSurface: '#E4F5EE',
  surface: '#FFFEFA',
  surfaceMuted: '#EDEEE8',
  text: '#202C2B',
  textMuted: '#52635F',
};

export const darkColors: ThemeColors = {
  accent: '#A0DDD9',
  accentForeground: '#102E2E',
  accentSurface: '#254644',
  border: '#405451',
  canvas: '#111D1D',
  danger: '#FF8A80',
  dangerSurface: '#3A1D20',
  focus: '#A0DDD9',
  success: '#7EDDB9',
  successSurface: '#16352F',
  surface: '#192827',
  surfaceMuted: '#263937',
  text: '#F7F4ED',
  textMuted: '#B6C7C2',
};

export const subjectColors = {
  radical: { background: '#087EA4', foreground: '#FFFFFF' },
  kanji: { background: '#C21D78', foreground: '#FFFFFF' },
  vocabulary: { background: '#7151C7', foreground: '#FFFFFF' },
  kana_vocabulary: { background: '#5D4AB2', foreground: '#FFFFFF' },
} as const;

export const srsColors = {
  apprentice: '#C43C8B',
  guru: '#9164D5',
  master: '#527EC7',
  enlightened: '#268891',
  burned: '#B07B35',
} as const;
