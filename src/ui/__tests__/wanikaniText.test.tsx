import { screen } from '@testing-library/react-native';

import { renderApp } from '@/test/render';
import { WaniKaniText } from '../components/WaniKaniText';
import { ThemeProvider } from '../theme/ThemeProvider';
import { subjectColors } from '../theme/colors';

test('renders API emphasis as readable text with subject identity', async () => {
  await renderText(
    'Remember the <radical>nine</radical> radical and <kanji>sun</kanji>.',
  );

  expect(screen.getByText('nine')).toHaveStyle({
    color: subjectColors.radical.background,
  });
  expect(screen.getByText('sun')).toHaveStyle({
    color: subjectColors.kanji.background,
  });
  expect(screen.queryByText(/<radical>/)).not.toBeOnTheScreen();
});

test('keeps nested emphasis and ordinary comparison text readable', async () => {
  await renderText('Use <meaning>the <kanji>sun</kanji></meaning>. 1 < 3.');

  expect(screen.getByText('sun')).toHaveStyle({ fontWeight: '700' });
  expect(screen.getByText(/1 < 3/)).toBeOnTheScreen();
});

async function renderText(value: string) {
  await renderApp(
    <ThemeProvider scheme="light">
      <WaniKaniText>{value}</WaniKaniText>
    </ThemeProvider>,
  );
}
