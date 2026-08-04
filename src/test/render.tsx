import {
  render,
  type RenderOptions,
} from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  SafeAreaProvider,
  type SafeAreaProviderProps,
} from 'react-native-safe-area-context';

const INITIAL_METRICS: SafeAreaProviderProps['initialMetrics'] = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

export function renderApp(
  element: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(element, {
    ...options,
    wrapper: ({ children }) => (
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        {children}
      </SafeAreaProvider>
    ),
  });
}
