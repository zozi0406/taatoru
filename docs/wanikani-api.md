# WaniKani API integration

Last validated: 4 August 2026

Taatoru uses the [WaniKani API v2 revision
20170710](https://docs.api.wanikani.com/20170710/). This document summarizes the
parts of that reference that govern Taatoru, records the current validation
result, and provides a checklist for future audits.

This is an implementation guide, not a substitute for the official reference.
Recheck the official site before changing the API client because non-breaking
changes apply to every API revision.

## Official API contract

- Base URL: `https://api.wanikani.com/v2/`.
- Authentication: send `Authorization: Bearer <token>` with every request.
- Revision: send `Wanikani-Revision: 20170710` with every request.
- Transport and format: use HTTPS and expect JSON for successful and error
  responses.
- Collections: follow `pages.next_url` until it is `null`. The usual page size
  is 500; subjects and reviews can return up to 1,000 records per page.
- Errors: handle the documented HTTP statuses and the JSON error envelope.
- Rate limit: use the server's `RateLimit-Limit`, `RateLimit-Remaining`, and
  `RateLimit-Reset` response headers. The documented limit is 60 requests per
  minute.
- Caching: keep durable local copies, especially of subjects, and refresh them
  instead of downloading unchanged collections repeatedly.
- Conditional requests: retain `ETag` or `Last-Modified` per endpoint and send
  `If-None-Match` or `If-Modified-Since` on later reads. A `304` response has no
  JSON body and means the cached representation is still current.
- Incremental collections: send `updated_after` and retain the previous cursor
  when an incremental response contains no resources and therefore has a
  `null` `data_updated_at`.
- Subscription restrictions: never expose subject content above
  `user.subscription.max_level_granted`. The user `level` field does not account
  for subscription status. Treat an unknown subscription conservatively and
  refresh the user resource often enough to notice access changes.
- Terms: WaniKani's reference says third-party tools must not use WaniKani
  subject content for profit. Confirm the current terms and obtain appropriate
  permission before any commercial distribution.

Relevant official sections:

- [Getting started](https://docs.api.wanikani.com/20170710/#getting-started)
- [Rate limit](https://docs.api.wanikani.com/20170710/#rate-limit)
- [Revisions](https://docs.api.wanikani.com/20170710/#revisions-aka-versioning)
- [Best practices](https://docs.api.wanikani.com/20170710/#best-practices)
- [Conditional requests](https://docs.api.wanikani.com/20170710/#conditional-requests)
- [`updated_after`](https://docs.api.wanikani.com/20170710/#leveraging-the-updated-after-filter)
- [Subscription restrictions](https://docs.api.wanikani.com/20170710/#respecting-subscription-restrictions)

## Validation result

Taatoru is **partially aligned** with the official best practices. Its basic
request contract, durable local cache, pagination, and most incremental reads
are sound. It is not yet fully compliant with the subscription-access guidance,
and its cache and rate-limit handling leave avoidable correctness and network
risks.

| Area | Status | Current evidence |
| --- | --- | --- |
| HTTPS, authentication, and revision | Compliant | `HttpWaniKaniApi.request()` uses the HTTPS v2 base URL and sends Bearer authentication plus `Wanikani-Revision: 20170710`. Client tests assert both headers. |
| Response envelopes and pagination | Compliant | `decodeResource()`, `decodeCollectionPage()`, and `fetchAllPages()` validate envelopes and follow `pages.next_url` with repeated-URL protection. |
| Durable local caching | Compliant | Server resources and synchronization cursors are stored in SQLite. Full refresh replacement is transactional, and subject data is available offline. |
| Incremental synchronization | Partial | Subjects, assignments, study materials, voice actors, and review statistics use `updated_after`. Level progressions are downloaded in full on every quick sync. |
| Empty incremental responses | Compliant | `HttpWaniKaniApi` falls back to the supplied `updated_after` cursor when an incremental response has `data_updated_at: null`. A focused client test covers all five incremental collections. |
| Hidden-resource transitions | Gap | Incremental subject, assignment, and review-statistic reads request `hidden=false`. A resource that changes from visible to hidden no longer matches that filtered scope, so its previously cached visible row can survive until a full refresh. |
| Conditional requests | Gap | The client neither stores response `ETag`/`Last-Modified` values nor sends `If-None-Match`/`If-Modified-Since`, and it does not accept `304` as a successful cache result. |
| Rate-limit handling | Partial | Taatoru keeps a local 60-request server-minute estimate and budgets pending writes. It ignores the official `RateLimit-*` headers, and `429` recovery reads `Retry-After` rather than the documented `RateLimit-Reset`. |
| Subscription restrictions | Partial | Lesson, review, dashboard, and notification availability queries cap content at `max_level_granted`. Search, direct subject details, related subjects, analytics labels, and resumed session subject loads do not consistently apply that cap. |
| Token handling and diagnostics | Compliant | Tokens are kept in SecureStore rather than SQLite, query strings are removed from stored diagnostic URLs, and authorization headers are not logged. |

## Validation evidence

The 4 August 2026 audit used:

- the live official revision-20170710 reference, including its getting-started,
  rate-limit, best-practices, subjects, assignments, level-progressions, and
  user sections;
- static inspection of the implementation paths listed below; and
- the complete project gate: ESLint, TypeScript checking, and all 210 Jest
  tests across 46 suites. The suite includes the API client, pagination,
  rate-limit tracker, synchronization, resource repositories, search, subject
  details, similar kanji, and analytics; and
- a live, read-only check of all five incremental collections using a cursor
  one minute in the past. Each endpoint returned an empty collection and the
  client preserved the supplied cursor.

The live check made no assignment, review, or study-material writes and
recorded no account content or credential. The passing checks do not turn the
other documented gaps into compliant behavior.

## Required follow-up

Address these items before treating the integration as fully aligned:

1. Enforce `max_level_granted` at the shared subject-content boundary, including
   search, direct routes, related and similar subjects, analytics labels, and
   resumed lesson or review sessions. Add free-account and subscription-
   downgrade tests.
2. Fetch hidden transitions during incremental synchronization, then keep
   hidden rows cached only if needed while excluding them from user-facing
   queries.
3. Read `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` from
   every response. Pace requests using those server values and make `429`
   retries honor `RateLimit-Reset`.
4. Add conditional reads for stable endpoints, beginning with `user` and
   `level_progressions`, and handle `304` without attempting to decode JSON.
5. Replace the unconditional quick-sync download of level progressions with
   `updated_after` or a conditional request.
6. Re-evaluate speculative parallel pagination after server-derived rate-limit
   budgeting is available so a full refresh cannot create an avoidable burst.

## Existing implementation map

- API transport, headers, writes, decoding, and collection filters:
  `src/api/HttpWaniKaniApi.ts`
- Sequential and speculative pagination: `src/api/pagination.ts`
- Local rate-limit estimate: `src/api/rateLimit.ts`
- Quick and full synchronization orchestration:
  `src/features/sync/SyncEngine.ts`
- Synchronization cursors and transactional full replacement:
  `src/features/sync/SyncRepository.ts` and the repositories under
  `src/db/repositories/`
- Secure token storage: `src/features/auth/tokenStore.ts`
- Subscription-aware lessons and reviews:
  `src/db/repositories/AssignmentRepository.ts` and
  `src/db/repositories/DerivedRepository.ts`
- Subject-content paths requiring a shared subscription gate:
  `src/features/search/search.ts`, `src/features/subjects/subjectDetails.ts`,
  `src/features/subjects/similarKanji.ts`,
  `src/features/analytics/calculations.ts`, and the session repositories

## Revalidation checklist

Use this checklist after changing the API client, synchronization engine,
subject-content queries, or WaniKani permissions:

- [ ] Re-read the official introduction, getting-started, best-practices, and
  changed resource sections.
- [ ] Confirm the base URL, Bearer header, and explicit API revision.
- [ ] Confirm every collection follows `pages.next_url` and rejects pagination
  loops.
- [ ] Confirm incremental cursors advance on new data and survive empty
  responses.
- [ ] Confirm visible-to-hidden transitions update existing cached rows.
- [ ] Confirm conditional requests preserve and reuse validators and accept
  `304` without JSON decoding.
- [ ] Confirm request pacing and `429` recovery use the server's current
  `RateLimit-*` headers.
- [ ] Test a free account or controlled fixture with `max_level_granted = 3`
  across search, details, relationships, analytics, lessons, reviews,
  notifications, deep links, and resumed sessions.
- [ ] Test a subscription downgrade without clearing the existing local cache.
- [ ] Confirm tokens, authorization headers, notes, answers, and full query
  strings do not enter logs or diagnostics.
- [ ] Run the API, synchronization, database-repository, search, subject,
  lesson, review, analytics, and notification test suites.
- [ ] Record the audit date and any remaining exceptions in this document.
