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
    await fireEvent(screen.getByLabelText('Allow skipping'), 'valueChange', true);
    await rendered.rerender(view(1));
    expect(close).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
  } finally { alert.mockRestore(); }
});
