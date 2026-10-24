import type { TextStyle } from 'react-native';

export const typography = {
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.7,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 39,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 23,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
} as const satisfies Readonly<Record<string, TextStyle>>;
