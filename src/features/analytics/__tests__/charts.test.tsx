import { screen } from '@testing-library/react-native';

import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { DonutChart } from '../DonutChart';
import { SimpleBarChart } from '../SimpleBarChart';

test('bar charts expose a summary and direct labels', async () => {
  await renderApp(
    <ThemeProvider scheme="light">
      <SimpleBarChart
        data={[
          { label: 'Now', value: 12 },
          { label: '2h', value: 4 },
        ]}
        summary="16 reviews across 2 time buckets"
        title="Upcoming reviews"
      />
    </ThemeProvider>,
  );

  expect(
    screen.getByLabelText(
      'Upcoming reviews. 16 reviews across 2 time buckets',
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText('Now: 12')).toBeOnTheScreen();
  expect(screen.getByText('2h: 4')).toBeOnTheScreen();
});

test('donut charts expose the same data as a readable legend', async () => {
  await renderApp(
    <ThemeProvider scheme="dark">
      <DonutChart
        data={[
          { color: '#2563EB', label: 'Apprentice', value: 8 },
          { color: '#7040C8', label: 'Guru', value: 4 },
        ]}
        summary="12 active subjects"
        title="SRS distribution"
      />
    </ThemeProvider>,
  );

  expect(
    screen.getByLabelText('SRS distribution. 12 active subjects'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Apprentice: 8')).toBeOnTheScreen();
  expect(screen.getByText('Guru: 4')).toBeOnTheScreen();
});
