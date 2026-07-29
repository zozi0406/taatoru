import { render } from '@testing-library/react-native';

import RootLayout from '../../../app/_layout';

const mockScreenNames: string[] = [];

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  function MockStack({
    children,
  }: {
    readonly children: React.ReactNode;
  }) {
    return React.createElement(React.Fragment, null, children);
  }
  function MockScreen({ name }: { readonly name: string }) {
    mockScreenNames.push(name);
    return null;
  }
  function MockProtected({
    children,
    guard,
  }: {
    readonly children: React.ReactNode;
    readonly guard: boolean;
  }) {
    return guard
      ? React.createElement(React.Fragment, null, children)
      : null;
  }
  MockStack.Screen = MockScreen;
  MockStack.Protected = MockProtected;
  return { Stack: MockStack };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('@/app/AppProviders', () => ({
  AppProviders: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'unauthenticated' }),
}));

jest.mock('@/ui/theme/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

beforeEach(() => {
  mockScreenNames.length = 0;
});

test('registers the concrete login screen in the unauthenticated stack', async () => {
  await render(<RootLayout />);

  expect(mockScreenNames).toEqual(['index', '(auth)/login']);
});
