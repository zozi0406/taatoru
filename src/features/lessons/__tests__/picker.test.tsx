import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

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
  ).toMatchObject({ checked: true });
  expect(
    screen.getByRole('checkbox', { name: 'One' }).props.accessibilityState,
  ).toMatchObject({ checked: false });
  expect(
    screen.getByRole('button', { name: 'Begin selected lessons' }),
  ).toBeEnabled();
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

test('keeps cancellation available without changing assignments or beginning lessons', async () => {
  const onCancel = jest.fn();
  const onBegin = jest.fn(async () => undefined);
  const onSelectionChange = jest.fn(async () => undefined);
  await renderPicker({ onCancel, onBegin, onSelectionChange });
  await screen.findByRole('checkbox', { name: 'One' });

  await act(async () => {
    fireEvent.press(
      screen.getByRole('button', { name: 'Cancel lesson selection' }),
    );
  });

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onBegin).not.toHaveBeenCalled();
  expect(onSelectionChange).not.toHaveBeenCalled();
});

test('locks selection and footer controls while the selected session is prepared', async () => {
  let finish!: () => void;
  const onBegin = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await renderPicker({ onBegin, restoredSelectedIds: [1] });
  const begin = await screen.findByRole('button', {
    name: 'Begin selected lessons',
  });
  await act(async () => {
    fireEvent.press(begin);
  });
  await waitFor(() => expect(onBegin).toHaveBeenCalledTimes(1));

  expect(begin).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Cancel lesson selection' }),
  ).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Ground' })).toBeDisabled();
  expect(screen.getByText('1 selected')).toBeVisible();

  await act(async () => {
    finish();
  });
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

test('preserves the latest selection when an older device save is slow', async () => {
  let finishFirst!: () => void;
  let savedIds: readonly number[] = [];
  let saves = 0;
  await renderPicker({
    onSelectionChange: async (items) => {
      if (++saves === 1) {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      }
      savedIds = items.map(({ subjectId }) => subjectId);
    },
  });
  await act(async () => {
    fireEvent.press(await screen.findByRole('checkbox', { name: 'One' }));
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('checkbox', { name: 'Ground' }));
  });
  expect(screen.getByText('2 selected')).toBeVisible();
  await act(async () => {
    finishFirst();
  });
  await waitFor(() => expect(savedIds).toEqual([1, 2]));
});

test('cancels after pending saves so they cannot recreate a discarded selection', async () => {
  let finishSave!: () => void;
  let savedIds: readonly number[] | null = null;
  await renderPicker({
    onSelectionChange: async (items) => {
      await new Promise<void>((resolve) => {
        finishSave = resolve;
      });
      savedIds = items.map(({ subjectId }) => subjectId);
    },
    onCancel: () => {
      savedIds = null;
    },
  });
  await act(async () => {
    fireEvent.press(await screen.findByRole('checkbox', { name: 'One' }));
  });
  await act(async () => {
    fireEvent.press(
      screen.getByRole('button', { name: 'Cancel lesson selection' }),
    );
  });
  await act(async () => {
    finishSave();
  });
  expect(savedIds).toBeNull();
});

test('waits for pending selection saves before starting the chosen session', async () => {
  let finishFirst!: () => void;
  let phase = 'none';
  let saves = 0;
  await renderPicker({
    onSelectionChange: async () => {
      if (++saves === 1) {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      }
      phase = 'selection';
    },
    onBegin: async () => {
      phase = 'presentation';
    },
  });
  await act(async () => {
    fireEvent.press(await screen.findByRole('checkbox', { name: 'One' }));
  });
  await act(async () => {
    fireEvent.press(
      screen.getByRole('button', { name: 'Begin selected lessons' }),
    );
  });
  await act(async () => {
    finishFirst();
  });
  await waitFor(() => expect(phase).toBe('presentation'));
});

test('selects a subject group within the limit and keeps deselection available', async () => {
  await renderPicker({ maxSelection: 1 });
  await act(async () => {
    fireEvent.press(
      await screen.findByRole('button', { name: 'Select Radicals at level 1' }),
    );
  });
  expect(screen.getByText('1 of 1 selected')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'One' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Ground' })).toBeEnabled();
  await act(async () => {
    fireEvent.press(
      screen.getByRole('button', { name: 'Clear Radicals at level 1' }),
    );
  });
  expect(screen.getByText('0 of 1 selected')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'One' })).toBeEnabled();
});

test('can retry a failed local lesson load without reporting an empty queue', async () => {
  const loadCandidates = jest
    .fn()
    .mockRejectedValueOnce(new Error('Device database busy'))
    .mockResolvedValueOnce(ITEMS);
  await renderPicker({ loadCandidates });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByText('No lessons are currently available.')).toBeNull();
  await act(async () => {
    fireEvent.press(
      screen.getByRole('button', { name: 'Retry loading lessons' }),
    );
  });
  expect(await screen.findByRole('checkbox', { name: 'One' })).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
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
  onCancel = jest.fn(),
  onSelectionChange = async () => undefined,
  restoredSelectedIds = [],
  maxSelection,
}: {
  readonly loadCandidates?: () => Promise<readonly LessonPickerItem[]>;
  readonly onCancel?: () => void;
  readonly onBegin?: (items: readonly LessonPickerItem[]) => Promise<void>;
  readonly onSelectionChange?: (
    items: readonly LessonPickerItem[],
  ) => Promise<void>;
  readonly restoredSelectedIds?: readonly number[];
  readonly maxSelection?: number;
} = {}) {
  return renderApp(
    <ThemeProvider scheme="light">
      <LessonPickerScreen
        loadCandidates={loadCandidates}
        onBegin={onBegin}
        onCancel={onCancel}
        onSelectionChange={onSelectionChange}
        restoredSelectedIds={restoredSelectedIds}
        maxSelection={maxSelection}
      />
    </ThemeProvider>,
  );
}
