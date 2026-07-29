export interface ThemeColors {
  readonly accent: string;
  readonly accentForeground: string;
  readonly border: string;
  readonly canvas: string;
  readonly danger: string;
  readonly dangerSurface: string;
  readonly focus: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly text: string;
  readonly textMuted: string;
}

export const lightColors: ThemeColors = {
  accent: '#2563EB',
  accentForeground: '#FFFFFF',
  border: '#DCE1E8',
  canvas: '#F5F7FA',
  danger: '#B42318',
  dangerSurface: '#FEECEB',
  focus: '#1D4ED8',
  surface: '#FFFFFF',
  surfaceMuted: '#EDF1F5',
  text: '#17202A',
  textMuted: '#5C6673',
};

export const darkColors: ThemeColors = {
  accent: '#6EA0FF',
  accentForeground: '#07152E',
  border: '#303844',
  canvas: '#0E1218',
  danger: '#FF8A80',
  dangerSurface: '#3A1D20',
  focus: '#8CB4FF',
  surface: '#171D25',
  surfaceMuted: '#212934',
  text: '#F4F6F8',
  textMuted: '#A8B1BD',
};

export const subjectColors = {
  radical: { background: '#007EA5', foreground: '#FFFFFF' },
  kanji: { background: '#C92F76', foreground: '#FFFFFF' },
  vocabulary: { background: '#7040C8', foreground: '#FFFFFF' },
  kana_vocabulary: { background: '#4F3AA8', foreground: '#FFFFFF' },
} as const;
