import type { SubjectResource } from '@/api/types';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as fs from 'expo-file-system/legacy';
import { radicalFixture } from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { ReviewPrompt } from '@/features/reviews/ReviewPrompt';
import { DEFAULT_STUDY_SETTINGS } from '@/features/settings/studySettings';
import { SubjectGlyph } from '@/ui/components/SubjectGlyph';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { migrateDatabase } from '@/db/migrate';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { RadicalImageCache, RadicalImagePreparation, prepareRadicalImages } from '../radicalImages';

const mockFiles = new Map<string, string>();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  readAsStringAsync: jest.fn(async (path: string) => {
    if (!mockFiles.has(path)) throw new Error('missing');
    return mockFiles.get(path);
  }),
  writeAsStringAsync: jest.fn(async (path: string, value: string) => { mockFiles.set(path, value); }),
  makeDirectoryAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    mockFiles.set(to, mockFiles.get(from)!); mockFiles.delete(from);
  }),
  deleteAsync: jest.fn(async (path: string) => { mockFiles.delete(path); }),
}));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }) }));

// Original, deliberately tiny geometric fixture; no upstream asset content.
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1h8v8H1z"/></svg>';
const image = { url: 'https://media.example.test/original-square.svg', content_type: 'image/svg+xml' as const };
const subject = { ...radicalFixture, data: { ...radicalFixture.data, characters: null, character_images: [{ ...image, metadata: { color: '#000000', dimensions: '10x10', style_name: 'original' } }] } };
const fetchImage = jest.fn();
beforeEach(() => {
  mockFiles.clear();
  fetchImage.mockReset();
  fetchImage.mockResolvedValue({ ok: true, text: async () => svg });
  global.fetch = fetchImage;
});

test('downloads public media without credentials and reuses durable content after a new cache instance', async () => {
  expect(await new RadicalImageCache().load(image)).toEqual({ kind: 'svg', content: svg });
  fetchImage.mockRejectedValue(new Error('offline'));
  expect(await new RadicalImageCache().load(image)).toEqual({ kind: 'svg', content: svg });
  expect(fetchImage).toHaveBeenCalledTimes(1);
  expect(fetchImage).toHaveBeenCalledWith(image.url, expect.objectContaining({ credentials: 'omit' }));
  expect(fs.writeAsStringAsync).toHaveBeenCalledWith(expect.stringContaining('file:///documents/'), expect.any(String));
});

test('a failed download remains retryable and does not save an error page', async () => {
  fetchImage.mockResolvedValueOnce({ ok: false, text: async () => '<html>error</html>' });
  const cache = new RadicalImageCache();
  await expect(cache.load(image)).rejects.toThrow();
  expect(await cache.load(image)).toEqual({ kind: 'svg', content: svg });
});

test('rejects missing or unsupported media without fetching', async () => {
  await expect(new RadicalImageCache().load(undefined)).rejects.toThrow();
  await expect(new RadicalImageCache().load({ ...image, url: 'file:///private/file' })).rejects.toThrow();
  expect(fetchImage).not.toHaveBeenCalled();
});

async function prompt(testSubject: SubjectResource = subject) {
  const submit = jest.fn();
  const exit = jest.fn();
  await renderApp(<ThemeProvider scheme="dark"><ReviewPrompt
    subject={testSubject} prompt="meaning" feedback={null} index={0} total={1}
    settings={DEFAULT_STUDY_SETTINGS} busy={false} error={null}
    onExit={exit} onSubmit={submit} onContinue={jest.fn()} onOverride={jest.fn()}
    onSkip={jest.fn()} onRetrySave={jest.fn()}
  /></ThemeProvider>);
  return { submit, exit };
}

test('failed required media blocks grading with a neutral retry state, keeps exit usable and recovers on retry', async () => {
  fetchImage.mockRejectedValueOnce(new Error('offline'));
  const { submit, exit } = await prompt();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry radical image' })).toBeVisible());
  expect(screen.queryByLabelText(`${radicalFixture.data.meanings[0]!.meaning} radical image`)).toBeNull();
  expect(screen.queryByText(`${radicalFixture.data.meanings[0]!.meaning} radical`)).toBeNull();
  expect(screen.getByLabelText('Meaning answer')).toHaveProp('editable', false);
  await fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'anything');
  await fireEvent(screen.getByLabelText('Meaning answer'), 'submitEditing');
  expect(submit).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Exit review session' }));
  expect(exit).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry radical image' }));
  await waitFor(() => expect(screen.getByLabelText('Meaning answer')).toHaveProp('editable', true));
  expect(screen.getByLabelText('Radical image')).toBeVisible();
});

test('missing image shows an explicit unavailable state without revealing the meaning', async () => {
  await prompt({ ...subject, data: { ...subject.data, character_images: [] } });
  await waitFor(() => expect(screen.getByText('Radical image unavailable. Connect and retry, or exit to resume later.')).toBeVisible());
  expect(screen.getByLabelText('Meaning answer')).toHaveProp('editable', false);
  expect(fetchImage).not.toHaveBeenCalled();
});


test('cached study image survives unmount and offline remount without revealing its answer', async () => {
  await prompt();
  await waitFor(() => expect(screen.getByLabelText('Meaning answer')).toHaveProp('editable', true));
  await screen.unmount();
  fetchImage.mockRejectedValue(new Error('offline'));
  await prompt();
  await waitFor(() => expect(screen.getByLabelText('Meaning answer')).toHaveProp('editable', true));
  expect(screen.getByLabelText('Radical image')).toBeVisible();
  expect(fetchImage).toHaveBeenCalledTimes(1);
});

test('prepares image-only library radicals without touching assignment state', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    await new SubjectRepository(db).replaceSubjects([subject, { ...radicalFixture, id: 102 }], null);
    await prepareRadicalImages(db);
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(await db.all('SELECT * FROM assignments')).toEqual([]);
    fetchImage.mockRejectedValue(new Error('offline'));
    expect(await new RadicalImageCache().load(image)).toEqual({ kind: 'svg', content: svg });
  } finally { await db.close(); }
});

test('raster content is stored as local data and remains available offline', async () => {
  fetchImage.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer });
  const png = { ...image, content_type: 'image/png' };
  const result = { kind: 'raster', content: 'data:image/png;base64,AQIDBA==' };
  expect(await new RadicalImageCache().load(png)).toEqual(result);
  fetchImage.mockRejectedValue(new Error('offline'));
  expect(await new RadicalImageCache().load(png)).toEqual(result);
});

test('decorative selection tiles keep a compact failure marker instead of overflowing with quiz recovery copy', async () => {
  fetchImage.mockRejectedValue(new Error('offline'));
  await renderApp(<SubjectGlyph characters={null} type="radical" image={image} />);
  await waitFor(() => expect(screen.getByText('!', { includeHiddenElements: true })).toBeTruthy());
  expect(screen.queryByText('Radical image unavailable. Connect and retry, or exit to resume later.', { includeHiddenElements: true })).toBeNull();
});

test.each(['<html>error</html>', '<svg></svg>', '<svg><path></svg>'])(
  'rejects unusable SVG content instead of enabling an empty prompt: %s',
  async (content) => {
    fetchImage.mockResolvedValueOnce({ ok: true, text: async () => content });
    await expect(new RadicalImageCache().load(image)).rejects.toThrow();
  },
);

test('a decoded raster failure keeps grading blocked and offers a fresh download', async () => {
  fetchImage.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Uint8Array.from([1]).buffer });
  const pngSubject = { ...subject, data: { ...subject.data, character_images: [{ ...subject.data.character_images[0]!, content_type: 'image/png' as const }] } };
  const { submit } = await prompt(pngSubject);
  await waitFor(() => expect(screen.getByLabelText('Radical image')).toBeVisible());
  expect(screen.getByLabelText('Meaning answer')).toHaveProp('editable', false);
  await fireEvent(screen.getByLabelText('Radical image'), 'error', { nativeEvent: { error: 'invalid image' } });
  expect(screen.getByRole('button', { name: 'Retry radical image' })).toBeVisible();
  expect(screen.getByLabelText('Meaning answer')).toHaveProp('editable', false);
  expect(submit).not.toHaveBeenCalled();
});

test.each([
  '<svg><g/></svg>',
  '<svg><defs><path d="M1 1h8v8H1z"/></defs></svg>',
  '<svg><notSupported/></svg>',
  '<svg><g><g/></g></svg>',
])('structurally blank SVG keeps grading blocked with Retry: %s', async (content) => {
  fetchImage.mockResolvedValueOnce({ ok: true, text: async () => content });
  await prompt();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry radical image' })).toBeVisible());
  expect(screen.getByLabelText('Meaning answer')).toHaveProp('editable', false);
});

async function preparationDatabase() {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new SubjectRepository(db).replaceSubjects(Array.from({ length: 9 }, (_, index) => ({
    ...subject, id: 1000 + index,
    data: { ...subject.data, character_images: [{ ...subject.data.character_images[0]!, url: `https://media.example.test/shape-${index}.svg` }] },
  })), '2026-11-02T12:00:00Z');
  return db;
}

test('concurrent library preparations coalesce into one four-wide walk and reuse the prepared version', async () => {
  const db = await preparationDatabase();
  const preparation = new RadicalImagePreparation(db);
  const all = jest.spyOn(db, 'all');
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  fetchImage.mockImplementation(async () => { await held; return { ok: true, text: async () => svg }; });
  try {
    const first = preparation.prepare();
    const second = preparation.prepare();
    await waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(4));
    expect(all).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(fetchImage).toHaveBeenCalledTimes(9);
    await preparation.prepare();
    expect(all).toHaveBeenCalledTimes(1);
  } finally { release(); preparation.dispose(); await db.close(); }
});

test('disposing library preparation during a held batch never schedules later batches', async () => {
  const db = await preparationDatabase();
  const preparation = new RadicalImagePreparation(db);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  fetchImage.mockImplementation(async () => { await held; return { ok: true, text: async () => svg }; });
  try {
    const work = preparation.prepare();
    await waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(4));
    preparation.dispose();
    release();
    await work;
    await preparation.prepare();
    expect(fetchImage).toHaveBeenCalledTimes(4);
  } finally { release(); preparation.dispose(); await db.close(); }
});

test('a supported path inside nested groups remains usable', async () => {
  const content = '<svg><defs/><g><g><path d="M1 1h8v8H1z"/></g></g></svg>';
  fetchImage.mockResolvedValueOnce({ ok: true, text: async () => content });
  expect(await new RadicalImageCache().load(image)).toEqual({ kind: 'svg', content });
});

test('backgrounding stops subsequent batches even if preparation is requested again before the held batch settles', async () => {
  const db = await preparationDatabase();
  const preparation = new RadicalImagePreparation(db);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  fetchImage.mockImplementation(async () => { await held; return { ok: true, text: async () => svg }; });
  try {
    const work = preparation.prepare();
    await waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(4));
    preparation.setActive(false);
    await preparation.prepare();
    release();
    await work;
    expect(fetchImage).toHaveBeenCalledTimes(4);
    preparation.setActive(true);
    await preparation.prepare();
    expect(fetchImage).toHaveBeenCalledTimes(9);
  } finally { release(); preparation.dispose(); await db.close(); }
});
