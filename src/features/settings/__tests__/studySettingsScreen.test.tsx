import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { StudySettingsScreen } from '../StudySettingsScreen';
import { DEFAULT_STUDY_SETTINGS } from '../studySettings';

test('explains independent deferral and confirms before discarding a changed draft', async () => {
  const close = jest.fn();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    await renderApp(<ThemeProvider scheme="light"><StudySettingsScreen settings={DEFAULT_STUDY_SETTINGS} onClose={close} onSave={async () => {}} /></ThemeProvider>);
    await fireEvent.press(screen.getByRole('button', {name: 'Reviews'}));
    expect(screen.getByLabelText('Allow skipping')).toHaveProp('value', false);
    expect(screen.getByText(/In reviews it also resets mistake counts/)).toBeVisible();
    await fireEvent(screen.getByLabelText('Allow skipping'), 'valueChange', true);
    await fireEvent.press(screen.getAllByRole('button', {name: 'Back to study'})[0]!);
    expect(close).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Discard unsaved settings?', expect.any(String), expect.any(Array));
    const discard = alert.mock.calls[0]?.[2]?.find(({text}) => text === 'Discard');
    discard?.onPress?.();
    expect(close).toHaveBeenCalledTimes(1);
  } finally { alert.mockRestore(); }
});

jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }) }));

test('modal hardware Back requests use the same dirty-draft guard', async () => {
  const close = jest.fn();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = (closeRequest: number) => <ThemeProvider scheme="light"><StudySettingsScreen
    settings={DEFAULT_STUDY_SETTINGS} closeRequest={closeRequest} onClose={close} onSave={async () => {}} /></ThemeProvider>;
  try {
    const rendered = await renderApp(view(0));
    await fireEvent.press(screen.getByRole('button', {name: 'Reviews'}));
    await fireEvent(screen.getByLabelText('Allow skipping'), 'valueChange', true);
    await rendered.rerender(view(1));
    expect(close).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
  } finally { alert.mockRestore(); }
});

test('keeps drafts across sections and saves every change from the persistent action', async () => {
  const save = jest.fn(async () => {});
  await renderApp(<ThemeProvider scheme="light"><StudySettingsScreen settings={DEFAULT_STUDY_SETTINGS} onSave={save} /></ThemeProvider>);
  await fireEvent.press(screen.getByRole('button', {name: 'Reviews'}));
  await fireEvent(screen.getByLabelText('Allow skipping'), 'valueChange', true);
  await fireEvent(screen.getByLabelText('Play pronunciation automatically'), 'valueChange', true);
  await fireEvent.press(screen.getByRole('button', {name: 'Back to settings'}));
  await fireEvent.press(screen.getByRole('button', {name: 'Reviews'}));
  await fireEvent.press(screen.getByRole('radio', { name: 'Question order: Reading → Meaning' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({allowSkipping: true, autoplay: true, questionOrder: 'reading-first'}));
  expect(screen.getByLabelText('Allow skipping')).toHaveProp('value', true);
  expect(screen.getByText('Settings saved.')).toBeVisible();
});

test('a failed settings save keeps the draft available for retry from another section', async () => {
  const save = jest.fn().mockRejectedValueOnce(new Error('Storage busy')).mockResolvedValue(undefined);
  await renderApp(<ThemeProvider scheme="dark"><StudySettingsScreen settings={DEFAULT_STUDY_SETTINGS} onSave={save} /></ThemeProvider>);
  await fireEvent.press(screen.getByRole('button', {name: 'Reviews'}));
  await fireEvent(screen.getByLabelText('Exact matching'), 'valueChange', true);
  await fireEvent.press(screen.getByRole('button', {name: 'Save settings'}));
  expect(screen.getByRole('alert')).toHaveTextContent(/Unable to save settings/);
  await fireEvent.press(screen.getByRole('button', {name: 'Back to settings'}));
  await fireEvent.press(screen.getByRole('button', {name: 'Lessons'}));
  await fireEvent.press(screen.getByRole('button', {name: 'Save settings'}));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({exactMatch: true}));
  expect(screen.getByText('Settings saved.')).toBeVisible();
});
