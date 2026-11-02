import { parse } from 'react-native-svg';
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
    return ast?.tag === 'svg' && ast.children.some(
      (child) => typeof child !== 'string',
    );
  } catch {
    return false;
  }
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
export async function prepareRadicalImages(db: Database): Promise<void> {
  const rows = await db.all<{ resource_json: string }>(
    "SELECT resource_json FROM subjects WHERE object = 'radical' AND characters IS NULL AND hidden_at IS NULL",
  );
  for (let index = 0; index < rows.length; index += 4) {
    await Promise.allSettled(
      rows.slice(index, index + 4).map(async (row) => {
        const subject = JSON.parse(row.resource_json) as SubjectResource;
        await radicalImages.load(radicalImageSource(subject));
      }),
    );
  }
}
