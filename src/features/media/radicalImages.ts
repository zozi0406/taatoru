import { Children, isValidElement, type ReactNode } from 'react';
import { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect, Svg, parse } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import type { SubjectResource } from '@/api/types';
import type { Database } from '@/db/Database';

export interface RadicalImageSource {
  readonly url: string;
  readonly content_type: string;
}
export type RadicalImageContent =
  | { readonly kind: 'svg'; readonly content: string }
  | { readonly kind: 'raster'; readonly content: string };

export function radicalImageSource(
  subject: SubjectResource,
): RadicalImageSource | undefined {
  if (subject.object !== 'radical') return undefined;
  return subject.data.character_images.find(
    (image) => image.content_type === 'image/svg+xml',
  ) ?? subject.data.character_images.find(
    (image) => /^image\/(png|jpeg|gif|webp)$/.test(image.content_type),
  );
}

/** Public, URL-keyed content only: never shares API headers or account lifecycle. */
export class RadicalImageCache {
  private readonly pending = new Map<string, Promise<RadicalImageContent>>();

  async load(
    image?: RadicalImageSource,
    refresh = false,
  ): Promise<RadicalImageContent> {
    if (image === undefined) throw new Error('Missing radical image');
    const url = new URL(image.url);
    if (
      url.protocol !== 'https:' || url.username || url.password ||
      !/^image\/(svg\+xml|png|jpeg|gif|webp)$/.test(image.content_type)
    ) {
      throw new Error('Unsupported radical image');
    }
    const key = image.url + '\n' + image.content_type;
    const current = this.pending.get(key);
    if (current !== undefined) return current;
    const operation = this.readOrDownload(image, key, refresh);
    this.pending.set(key, operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(key);
    }
  }

  private async readOrDownload(
    image: RadicalImageSource,
    key: string,
    refresh: boolean,
  ): Promise<RadicalImageContent> {
    if (FileSystem.documentDirectory === null) {
      throw new Error('Image storage unavailable');
    }
    const directory = FileSystem.documentDirectory + 'radical-images-v1/';
    // Split the reversible URL key into safe path components rather than relying
    // on a lossy hash (or exceeding filesystem filename length limits).
    const encoded = encodeURIComponent(key).replace(/_/g, '%5F').replace(/%/g, '_');
    const parts = encoded.match(/.{1,100}/g)!;
    const path = directory + parts.join('/') + '/image.json';
    if (!refresh) {
      try {
        const cached = JSON.parse(await FileSystem.readAsStringAsync(path));
        if (cached.key === key && validContent(cached.image, image)) {
          return cached.image;
        }
      } catch {
        // A missing/interrupted file can be downloaded again.
      }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let content: RadicalImageContent;
    try {
      const response = await fetch(image.url, {
        credentials: 'omit', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Image download failed');
      if (image.content_type === 'image/svg+xml') {
        content = { kind: 'svg', content: await response.text() };
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 1_000_000) throw new Error('Image too large');
        content = { kind: 'raster', content: `data:${image.content_type};base64,${base64(bytes)}` };
      }
      if (!validContent(content, image)) throw new Error('Invalid radical image');
    } finally {
      clearTimeout(timeout);
    }
    await FileSystem.makeDirectoryAsync(path.slice(0, path.lastIndexOf('/')), {
      intermediates: true,
    });
    const temporary = path + '.tmp';
    try {
      await FileSystem.writeAsStringAsync(
        temporary, JSON.stringify({ key, image: content }),
      );
      await FileSystem.moveAsync({ from: temporary, to: path });
    } finally {
      await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
    }
    return content;
  }
}

function validContent(
  value: unknown,
  image: RadicalImageSource,
): value is RadicalImageContent {
  if (
    typeof value !== 'object' || value === null ||
    !('kind' in value) || !('content' in value) ||
    typeof value.content !== 'string' || value.content.length === 0 ||
    value.content.length > 1_400_000
  ) return false;
  return image.content_type === 'image/svg+xml'
    ? value.kind === 'svg' && validSvg(value.content)
    : value.kind === 'raster' && value.content.startsWith(`data:${image.content_type};base64,`);
}

function validSvg(xml: string): boolean {
  try {
    if (!/<svg[\s>]/i.test(xml) || !/<\/svg\s*>/i.test(xml)) return false;
    const ast = parse(xml);
    return ast?.tag === 'svg' && hasDrawing(ast.children);
  } catch {
    return false;
  }
}

/** Reject structurally blank/unsupported documents, without judging visual equivalence. */
function hasDrawing(children: ReactNode): boolean {
  return Children.toArray(children).some((child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return false;
    const props = child.props;
    if (child.type === G || child.type === Svg) {
      return hasDrawing(props.children as ReactNode);
    }
    if (child.type === Path) return typeof props.d === 'string' && props.d.trim() !== '';
    if (child.type === Rect) return positive(props.width) && positive(props.height);
    if (child.type === Circle) return positive(props.r);
    if (child.type === Ellipse) return positive(props.rx) && positive(props.ry);
    if (child.type === Polygon || child.type === Polyline) {
      return typeof props.points === 'string' && props.points.trim() !== '';
    }
    if (child.type === Line) return props.x1 !== props.x2 || props.y1 !== props.y2;
    // Definitions do not draw by themselves; unknown parser tags render null.
    return false;
  });
}

function positive(value: unknown): boolean {
  return (typeof value === 'number' || typeof value === 'string') && parseFloat(String(value)) > 0;
}

function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    result += alphabet[a >> 2]! + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]!
      + (b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]!)
      + (c === undefined ? '=' : alphabet[c & 63]!);
  }
  return result;
}

export const radicalImages = new RadicalImageCache();

/** Best-effort library preparation; media failure must never roll back sync/writes. */
export async function prepareRadicalImages(
  db: Database,
  isActive: () => boolean = () => true,
): Promise<boolean> {
  const rows = await db.all<{ resource_json: string }>(
    "SELECT resource_json FROM subjects WHERE object = 'radical' AND characters IS NULL AND hidden_at IS NULL",
  );
  let complete = true;
  for (let index = 0; index < rows.length; index += 4) {
    if (!isActive()) return false;
    const results = await Promise.allSettled(
      rows.slice(index, index + 4).map(async (row) => {
        const subject = JSON.parse(row.resource_json) as SubjectResource;
        await radicalImages.load(radicalImageSource(subject));
      }),
    );
    if (results.some((result) => result.status === 'rejected')) complete = false;
  }
  return complete && isActive();
}

/** One bounded walk per library version, owned by an application provider. */
export class RadicalImagePreparation {
  private pending: { generation: number; work: Promise<void> } | null = null;
  private generation = 0;
  private active = true;
  private disposed = false;
  private preparedVersion: string | null | undefined;

  constructor(private readonly db: Database) {}

  prepare(): Promise<void> {
    if (!this.active || this.disposed) return Promise.resolve();
    if (this.pending !== null) {
      return this.pending.generation === this.generation ? this.pending.work
        : this.pending.work.then(() => this.prepare());
    }
    const generation = this.generation;
    const current = () => this.active && !this.disposed && generation === this.generation;
    const work = (async () => {
      const state = await this.db.first<{ subjects_updated_at: string | null }>(
        'SELECT subjects_updated_at FROM sync_state WHERE id = 1',
      );
      if (!current() || state === null || state.subjects_updated_at === this.preparedVersion) return;
      if (await prepareRadicalImages(this.db, current)) this.preparedVersion = state.subjects_updated_at;
    })().finally(() => { this.pending = null; });
    this.pending = { generation, work };
    return work;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.generation += 1;
  }

  cancel(): void {
    this.generation += 1;
    this.preparedVersion = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.setActive(false);
  }
}
