import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import {
  AccountHibernationNotice,
  isHibernationMessage,
  WANIKANI_ACCOUNT_URL,
} from '../AccountHibernationNotice';

afterEach(() => {
  jest.restoreAllMocks();
});

test('opens the WaniKani website for account recovery', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await renderNotice();
  await act(async () => {
    fireEvent.press(screen.getByRole('link', { name: 'Open WaniKani' }));
  });
  expect(openURL).toHaveBeenCalledWith(WANIKANI_ACCOUNT_URL);
});

test('keeps a readable recovery address if the browser cannot open', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No browser'));
  await renderNotice();
  await act(async () => {
    fireEvent.press(screen.getByRole('link', { name: 'Open WaniKani' }));
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    /Visit https:\/\/www\.wanikani\.com\/ and sign in/,
  );
});

test('recognizes account hibernation without classifying unrelated errors', () => {
  expect(isHibernationMessage('The user is hibernating')).toBe(true);
  expect(isHibernationMessage('Account is in hibernation mode')).toBe(true);
  expect(isHibernationMessage('Token lacks permission')).toBe(false);
  expect(isHibernationMessage(null)).toBe(false);
});

function renderNotice() {
  return renderApp(
    <ThemeProvider scheme="dark">
      <AccountHibernationNotice />
    </ThemeProvider>,
  );
}
