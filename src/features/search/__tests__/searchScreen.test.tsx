import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { SearchScreen } from '../SearchScreen';
import type { SubjectSearchResult } from '../search';

const RESULT: SubjectSearchResult = {
  id: 201,
  object: 'kanji',
  level: 1,
  lessonPosition: 2,
  characters: '一',
  primaryMeaning: 'One',
  primaryReading: 'いち',
};

test('searches the local library and opens a selected subject', async () => {
  const loadResults = jest.fn(async () => [RESULT]);
  const onOpenSubject = jest.fn();
  await renderApp(
    <ThemeProvider scheme="light">
      <SearchScreen
        loadResults={loadResults}
        onOpenSubject={onOpenSubject}
      />
    </ThemeProvider>,
  );

  await fireEvent.changeText(
    screen.getByLabelText('Search subjects'),
    'one',
  );

  expect(loadResults).toHaveBeenCalledWith('one');
  expect(await screen.findByText('One')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Open One' }));
  expect(onOpenSubject).toHaveBeenCalledWith(201);
});

test('shows an honest empty state after a completed search', async () => {
  await renderApp(
    <ThemeProvider scheme="dark">
      <SearchScreen
        loadResults={jest.fn(async () => [])}
        onOpenSubject={jest.fn()}
      />
    </ThemeProvider>,
  );

  await fireEvent.changeText(
    screen.getByLabelText('Search subjects'),
    'not found',
  );

  expect(await screen.findByText('No matching subjects')).toBeOnTheScreen();
});
