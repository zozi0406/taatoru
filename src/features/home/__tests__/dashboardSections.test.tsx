import { screen } from '@testing-library/react-native';

import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { DashboardSections } from '../DashboardSections';
import type { DashboardSnapshot } from '../dashboard';

const EMPTY: DashboardSnapshot = {
  level: 1,
  lessonCount: 0,
  reviewCount: 0,
  nextReviewAt: null,
  reviewBuckets: [],
  currentLevel: {
    radical: { locked: 0, lesson: 0, apprentice: 0, guru: 0 },
    kanji: { locked: 0, lesson: 0, apprentice: 0, guru: 0 },
    vocabulary: { locked: 0, lesson: 0, apprentice: 0, guru: 0 },
  },
  srs: { apprentice: 0, guru: 0, master: 0, enlightened: 0, burned: 0 },
  pendingWriteCount: 0,
  vacationActive: false,
  online: true,
  lastSyncAt: null,
};

test('forecast groups arrivals without adding cumulative counts twice', async () => {
  await renderSection('forecast', {
    ...EMPTY,
    reviewBuckets: [
      { hoursFromNow: 0, count: 12, cumulative: 12 },
      { hoursFromNow: 1, count: 3, cumulative: 15 },
      { hoursFromNow: 4, count: 2, cumulative: 17 },
      { hoursFromNow: 5, count: 4, cumulative: 21 },
      { hoursFromNow: 24, count: 1, cumulative: 22 },
    ],
  });

  expect(
    screen.getByLabelText(
      'Next 24 hours. Now: 12 reviews, +4h: 5 reviews, +8h: 4 reviews, +12h: 0 reviews, +16h: 0 reviews, +20h: 0 reviews, +24h: 1 reviews',
    ),
  ).toBeOnTheScreen();
  expect(
    screen.getByText('22 reviews available across the next 24 hours'),
  ).toBeOnTheScreen();
});

test('empty levels expose no subjects instead of false completion', async () => {
  await renderSection('level', EMPTY);

  const meters = screen.getAllByRole('progressbar');
  expect(meters).toHaveLength(3);
  for (const meter of meters) {
    expect(meter.props.accessibilityValue).toEqual({
      min: 0,
      max: 1,
      now: 0,
      text: 'No subjects',
    });
  }
});

test('level meters retain all progress states in their accessible summaries', async () => {
  await renderSection('level', {
    ...EMPTY,
    currentLevel: {
      ...EMPTY.currentLevel,
      kanji: { locked: 4, lesson: 2, apprentice: 3, guru: 1 },
    },
  });

  expect(
    screen.getByRole('progressbar', {
      name: 'Kanji. 1 guru, 3 apprentice, 2 lessons, 4 locked',
    }).props.accessibilityValue,
  ).toEqual({ min: 0, max: 10, now: 1, text: '1 of 10 at Guru' });
});

test('an empty forecast explains the absence of activity', async () => {
  await renderSection('forecast', EMPTY);
  expect(
    screen.getByText('No reviews scheduled. Enjoy the breathing room.'),
  ).toBeOnTheScreen();
});

async function renderSection(
  section: 'forecast' | 'level',
  snapshot: DashboardSnapshot,
) {
  await renderApp(
    <ThemeProvider scheme="dark">
      <DashboardSections section={section} snapshot={snapshot} />
    </ThemeProvider>,
  );
}
