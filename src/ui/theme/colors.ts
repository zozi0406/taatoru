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
  accent: '#BB126C',
  accentForeground: '#FFFFFF',
  accentSurface: '#FCEAF4',
  border: '#E4E1EC',
  canvas: '#F6F5FA',
  danger: '#B42318',
  dangerSurface: '#FEECEB',
  focus: '#9C165E',
  success: '#17745C',
  successSurface: '#E4F5EE',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEDF5',
  text: '#242133',
  textMuted: '#696479',
};

export const darkColors: ThemeColors = {
  accent: '#FF80C3',
  accentForeground: '#350B24',
  accentSurface: '#342035',
  border: '#2B2D40',
  canvas: '#0D0F19',
  danger: '#FF8A80',
  dangerSurface: '#3A1D20',
  focus: '#FFB2DA',
  success: '#7EDDB9',
  successSurface: '#16352F',
  surface: '#171A29',
  surfaceMuted: '#222538',
  text: '#F4F2FC',
  textMuted: '#ABA8C0',
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
