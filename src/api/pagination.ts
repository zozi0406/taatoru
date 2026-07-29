// Copyright 2025 David Sansome
// Copyright 2026 Taatoru contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified by Taatoru from Tsurukame's WaniKaniAPI/APIClient.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import { ApiDecodeError } from './errors';
import type {
  CollectionPage,
  IdentifiedResource,
  WaniKaniObject,
} from './types';

export type PageFetcher<
  T,
  TObject extends WaniKaniObject = WaniKaniObject,
> = (
  url: string,
  signal?: AbortSignal,
) => Promise<CollectionPage<T, TObject>>;

export async function fetchAllPages<
  T,
  TObject extends WaniKaniObject = WaniKaniObject,
>(
  initialUrl: string,
  fetchPage: PageFetcher<T, TObject>,
  signal?: AbortSignal,
): Promise<CollectionPage<T, TObject>> {
  const visitedUrls = new Set<string>();
  const resources: IdentifiedResource<T, TObject>[] = [];
  let nextUrl: string | null = initialUrl;
  let firstPage: CollectionPage<T, TObject> | null = null;
  let lastPage: CollectionPage<T, TObject> | null = null;

  while (nextUrl !== null) {
    if (visitedUrls.has(nextUrl)) {
      throw new ApiDecodeError('WaniKani pagination repeated a page URL', {
        url: nextUrl,
      });
    }

    visitedUrls.add(nextUrl);
    const page = await fetchPage(nextUrl, signal);
    firstPage ??= page;
    lastPage = page;
    resources.push(...page.data);
    nextUrl = page.pages.next_url;
  }

  if (firstPage === null || lastPage === null) {
    throw new ApiDecodeError('WaniKani pagination returned no pages', {
      url: initialUrl,
    });
  }

  return mergePages(firstPage, lastPage, resources);
}

interface SpeculativePaginationOptions<
  T,
  TObject extends WaniKaniObject,
> {
  readonly url: string;
  readonly windows: number;
  readonly perPage: number;
  readonly fetchPage: PageFetcher<T, TObject>;
  readonly signal?: AbortSignal;
}

export async function fetchSpeculativePages<
  T,
  TObject extends WaniKaniObject = WaniKaniObject,
>({
  url,
  windows,
  perPage,
  fetchPage,
  signal,
}: SpeculativePaginationOptions<T, TObject>): Promise<
  CollectionPage<T, TObject>
> {
  if (!Number.isInteger(windows) || windows < 1) {
    throw new RangeError('windows must be a positive integer');
  }
  if (!Number.isInteger(perPage) || perPage < 1) {
    throw new RangeError('perPage must be a positive integer');
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted === true) {
    abortFromCaller();
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const pagePromises = Array.from({ length: windows }, (_, index) => {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set(
        'page_after_id',
        String(index * perPage - 1),
      );

      return fetchPage(pageUrl.toString(), controller.signal).catch(
        (error: unknown) => {
          controller.abort(error);
          throw error;
        },
      );
    });
    const pages = await Promise.all(pagePromises);
    const firstPage = pages[0];
    const finalWindow = pages.at(-1);
    if (firstPage === undefined || finalWindow === undefined) {
      throw new ApiDecodeError('WaniKani pagination returned no pages', {
        url,
      });
    }

    let lastPage = finalWindow;
    const resources = pages.flatMap((page) => page.data);
    if (finalWindow.pages.next_url !== null) {
      const tail = await fetchAllPages(
        finalWindow.pages.next_url,
        fetchPage,
        controller.signal,
      );
      resources.push(...tail.data);
      lastPage = tail;
    }

    return mergePages(
      { ...firstPage, url },
      lastPage,
      deduplicateResources(resources),
    );
  } finally {
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

function deduplicateResources<
  T,
  TObject extends WaniKaniObject,
>(
  resources: readonly IdentifiedResource<T, TObject>[],
): IdentifiedResource<T, TObject>[] {
  const seenIds = new Set<number>();
  return resources.filter(({ id }) => {
    if (seenIds.has(id)) {
      return false;
    }
    seenIds.add(id);
    return true;
  });
}

function mergePages<
  T,
  TObject extends WaniKaniObject,
>(
  firstPage: CollectionPage<T, TObject>,
  lastPage: CollectionPage<T, TObject>,
  data: readonly IdentifiedResource<T, TObject>[],
): CollectionPage<T, TObject> {
  return {
    ...firstPage,
    pages: lastPage.pages,
    data_updated_at: lastPage.data_updated_at ?? firstPage.data_updated_at,
    data,
  };
}
