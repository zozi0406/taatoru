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
import { compareWaniKaniDates } from './date';
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
    if (signal?.aborted) throw signal.reason ?? new Error('Request cancelled');
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

  return mergePages(firstPage, lastPage, deduplicateResources(resources));
}

function deduplicateResources<
  T,
  TObject extends WaniKaniObject,
>(
  resources: readonly IdentifiedResource<T, TObject>[],
): IdentifiedResource<T, TObject>[] {
  const byId = new Map<number, IdentifiedResource<T, TObject>>();
  for (const resource of resources) {
    const previous = byId.get(resource.id);
    if (previous === undefined || compareWaniKaniDates(resource.data_updated_at, previous.data_updated_at) >= 0)
      byId.set(resource.id, resource);
  }
  return [...byId.values()];
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
    data_updated_at: firstPage.data_updated_at,
    data,
  };
}
