import { fireEvent, render } from '@testing-library/react-native';

import HomeRoute from '../../../../app/(tabs)/index';

const mockRouter = {
  push: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@/app/AppProviders', () => ({
  useAppServices: () => ({
    db: {},
    isOnline: jest.fn(async () => true),
    synchronize: jest.fn(),
  }),
}));

jest.mock('@/features/home/HomeScreen', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    HomeScreen: ({
      onStartReviews,
    }: {
      readonly onStartReviews?: () => void;
    }) =>
      React.createElement(
        Pressable,
        {
          accessibilityLabel: 'Route reviews',
          accessibilityRole: 'button',
          onPress: onStartReviews,
        },
        React.createElement(Text, null, 'Route reviews'),
      ),
  };
});

beforeEach(() => {
  mockRouter.push.mockClear();
});

test('routes the enabled dashboard Reviews action to the review session', async () => {
  const view = await render(<HomeRoute />);

  fireEvent.press(view.getByRole('button', { name: 'Route reviews' }));

  expect(mockRouter.push).toHaveBeenCalledWith('/reviews/session');
});
