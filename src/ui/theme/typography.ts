import type { TextStyle } from 'react-native';

export const typography = {
  screenTitle: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  sectionTitle: {
    fontSize: 20,
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
