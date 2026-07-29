import {
  act,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import {
  LessonPickerScreen,
  type LessonPickerItem,
} from '../LessonPickerScreen';

test('restores selected IDs and exposes checked state and selected count', async () => {
  await renderPicker({
    restoredSelectedIds: [2],
  });

  expect(await screen.findByText('1 selected')).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: 'Ground' }).props.accessibilityState,
  ).toEqual({ checked: true });
  expect(
    screen.getByRole('checkbox', { name: 'One' }).props.accessibilityState,
  ).toEqual({ checked: false });
  expect(screen.getByRole('button', { name: 'Begin selected lessons' })).toBeEnabled();
});

test('toggles and deselects while Begin follows the empty selection', async () => {
  const onSelectionChange = jest.fn(async () => undefined);
  await renderPicker({ onSelectionChange });
  const begin = await screen.findByRole('button', {
    name: 'Begin selected lessons',
  });
  expect(begin).toBeDisabled();

  await act(async () => {
    fireEvent.press(screen.getByRole('checkbox', { name: 'One' }));
  });
  expect(begin).toBeEnabled();
  expect(screen.getByText('1 selected')).toBeVisible();
  expect(onSelectionChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ subjectId: 1 }),
  ]);

  await act(async () => {
    fireEvent.press(screen.getByRole('checkbox', { name: 'One' }));
  });
  expect(begin).toBeDisabled();
  expect(screen.getByText('0 selected')).toBeVisible();
});

test('revalidates stale assignments immediately before Begin', async () => {
  const loadCandidates = jest
    .fn<Promise<readonly LessonPickerItem[]>, []>()
    .mockResolvedValueOnce(ITEMS)
    .mockResolvedValueOnce([ITEMS[0]!]);
  const onBegin = jest.fn(async () => undefined);
  await renderPicker({ loadCandidates, onBegin });

  await act(async () => {
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Ground' }));
  });
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Begin selected lessons' }),
    ).toBeEnabled();
  });
  await act(async () => {
    fireEvent.press(
      screen.getByRole('button', { name: 'Begin selected lessons' }),
    );
  });

  expect(onBegin).not.toHaveBeenCalled();
  expect(
    await screen.findByText(
      'Your selection changed because some lessons are no longer available.',
    ),
  ).toBeVisible();
  expect(screen.getByText('0 selected')).toBeVisible();
});

test('uses a virtualized list for realistically long lesson lists', async () => {
  const longItems: readonly LessonPickerItem[] = Array.from(
    { length: 100 },
    (_, index) => ({
    ...ITEMS[0]!,
    assignmentId: index + 1_000,
    characters: String(index),
    lessonPosition: index,
    primaryMeaning: `Subject ${index}`,
    subjectId: index,
    }),
  );
  await renderPicker({
    loadCandidates: async () => longItems,
  });

  const list = await screen.findByTestId('lesson-picker-list');
  expect(list.props.data.length).toBeGreaterThan(100);
});

const ITEMS: readonly LessonPickerItem[] = [
  {
    assignmentId: 1_001,
    available: true,
    characters: '一',
    excluded: false,
    lessonPosition: 1,
    level: 1,
    primaryMeaning: 'One',
    subjectId: 1,
    subjectType: 'kanji',
  },
  {
    assignmentId: 1_002,
    available: true,
    characters: '地',
    excluded: false,
    lessonPosition: 2,
    level: 1,
    primaryMeaning: 'Ground',
    subjectId: 2,
    subjectType: 'radical',
  },
];

async function renderPicker({
  loadCandidates = async () => ITEMS,
  onBegin = async () => undefined,
  onSelectionChange = async () => undefined,
  restoredSelectedIds = [],
}: {
  readonly loadCandidates?: () => Promise<readonly LessonPickerItem[]>;
  readonly onBegin?: (
    items: readonly LessonPickerItem[],
  ) => Promise<void>;
  readonly onSelectionChange?: (
    items: readonly LessonPickerItem[],
  ) => Promise<void>;
  readonly restoredSelectedIds?: readonly number[];
} = {}) {
  return renderApp(
    <ThemeProvider scheme="light">
      <LessonPickerScreen
        loadCandidates={loadCandidates}
        onBegin={onBegin}
        onCancel={jest.fn()}
        onSelectionChange={onSelectionChange}
        restoredSelectedIds={restoredSelectedIds}
      />
    </ThemeProvider>,
  );
}
