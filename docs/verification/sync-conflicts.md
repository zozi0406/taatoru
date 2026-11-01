# When synchronization needs a decision

Current policy: 1 November 2026. This supersedes the original design's material-conflict chooser.

Notes and meaning synonyms use API authority. Reviews preserve local completion counts when the server has consumed a different opportunity and the app cannot safely attribute the result. A retry never turns an old completion into a later review.

## Entry paths

Every production delivery path converges on `SyncCoordinator.request()` → `OwnedSyncEngine.synchronize()` → `SyncPreflight.run()` → `SynchronizationEngine` → `PendingWriteSender` → `WriteReconciler`:

| Trigger | Entry code |
|---|---|
| Login, cached startup, token repair, initial-setup retry | `src/features/auth/AuthProvider.tsx`, using the shared factory in `src/app/AppProviders.tsx` |
| App returns to foreground, authenticated startup, reconnect | `src/app/AppProviders.tsx` lifecycle and connectivity effects; foreground retry timers in `src/features/sync/SyncCoordinator.ts` |
| Home quick sync / full library refresh | `app/(tabs)/index.tsx` → `HomeScreen` → `AppProviders.synchronize()` |
| Durable lesson/review transition, including offline Finish | `app/lessons/session.tsx`, `app/reviews/session.tsx` → repository transaction → `notifyPendingWrites()` |
| Subject note/synonym edit or in-session synonym addition | `app/subject/[id].tsx`, session routes → `PendingWriteRepository` → `notifyPendingWrites()` after commit |
| Background task | `src/features/notifications/backgroundTask.ts` → coordinator with a bounded background slice |
| Saved-change retry | `app/sync.tsx` → `SyncAttentionRepository.resolve()` → `notifyPendingWrites()` |

`OwnedSyncEngine` checks account/credentials/lease ownership. Preflight checks the account and confirmed resets before dispatch. Full refresh does not bypass reconciliation. Background processing persists attention; it never opens a dialog.

`SyncRepository.settleProgress()` persists a reason, delivery state and optional observed conflict in the same fenced transaction. The Home saved-change action opens `/sync`, registered in `app/_layout.tsx`. `SyncAttentionRepository.list()` supplies that screen. A rejected/uncertain state alone is not a local-versus-remote conflict: authentication, validation, eligibility and unverifiable history are separate attention conditions.

## The actual review choice

`WriteReconciler.reconcileProgress()` produces `review-conflict` when all of these hold:

1. The subject, assignment identity, unlock/resurrection generation and reset baseline still match.
2. A matching review-statistic identity has individually nondecreasing counters, with at least one counter increased.
3. The server due time advanced chronologically, or the assignment is burned: the old opportunity has been consumed.
4. This local operation has no uncertain/in-flight dispatch record, so it cannot be an acknowledgement of this client's potentially accepted submission. A known rejected/queued attempt does not bypass the decision.

Example: the device is offline, you finish a due review with two meaning mistakes, and another app submits the same subject's due review. On reconnect, WaniKani has increased counters and a later due time. Taatoru retains the offline counts and presents them on Saved changes.

- **Keep saved review on this device** leaves the operation and counts intact. It does not overwrite the server or submit the answers as the next review.
- **Use WaniKani progress** confirms discarding that exact saved operation/revision and imports the observed authoritative assignment/statistic. A newer server version already cached is preserved by version checks. A stale decision cannot delete a newer local revision.

WaniKani exposes review creation, not replacement of an already accepted historical review. A literal “upload my old counts over the other app's review” option would promise an unsupported API operation. Keeping local evidence is therefore explicit about its limits.

If this operation was already dispatched and its response was lost, matching identity, monotonic counters and an advanced opportunity can settle it as **superseded by remote progress**. That avoids a duplicate attempt; it does not prove that this client's counts were accepted. If evidence is incomplete, the operation remains for attention.

## Other progress differences that require attention

These are produced in `WriteReconciler.reconcileProgress()`, or after a 422 in `PendingWriteSender.sendProgress()`. They offer verification/retry or explicit local discard, rather than a promise to overwrite server state.

| Persisted reason | Difference or missing evidence |
|---|---|
| `unknown-baseline` | A migrated/local operation has no trustworthy original assignment/statistic/reset provenance. |
| `invalid-counts`, `invalid-baseline` | Saved counters are invalid, or saved assignment/subject identities disagree. |
| `account-reset` | A newly observed confirmed reset invalidated the cached opportunity, including reset then re-leveling. |
| `subject-unavailable` | Subject/assignment became hidden or locked, or exceeds the current content grant. A later valid grant can permit verification; nothing is silently discarded. |
| `assignment-missing`, `assignment-changed` | The assignment is absent or has another identity/subject. |
| `opportunity-changed` | Unlock/resurrection changed; stage changed without sufficient evidence; counters changed without an advanced due/burned state; or due time moved without proven review advancement (for example vacation scheduling). |
| `review-evidence-incomplete` | An established statistic disappeared, identity changed, any counter decreased, an older statistic arrived, or the original baseline is absent while remote history exists. Legitimate first reviews permit absent→absent statistics at stage 1 on the same opportunity. |
| `lesson-unavailable` | The original lesson opportunity was not a valid unstarted lesson. A same-assignment lesson already started remotely is automatically superseded. |
| `completion-time-invalid` | Completion time, fixed retry timestamp, server clock offset or original due/unlock boundary is inconsistent. |
| `validation-rejected` | WaniKani returned 422, and fresh reconciliation still cannot establish acceptance or safe supersession. Counts remain saved; unrelated operations continue. |

An offline session can start after an unseen remote reset. First discovery of that reset invalidates every saved session containing affected subjects, regardless of local wall time. Uncommitted prompts restart; already committed completions remain in the outbox for the rules above. A failed preflight prevents dispatch and preserves work.

401/403, quota waits, network timeouts and uncertain responses are delivery/credential conditions, not evidence that remote content should replace local work. Account replacement/sign-out has a separate explicit pending-work discard decision in `AuthProvider`; repairing or cancelling a credential transition preserves account data.

## Materials: no version chooser

`WriteReconciler.reconcileMaterial()` compares the original server baseline, desired local fields and a fresh successful subject lookup. Synonyms are one editable array; intentional removal is respected.

| Observation | Automatic behavior |
|---|---|
| Only local fields changed | Upload the local edit, consuming a typed API receipt. |
| Local and remote changed compatible fields | Preserve each changed field and upload the merged material. |
| Both changed the same field differently | Use the complete API material automatically. No “keep local” overwrite choice. |
| Missing legacy baseline | Use the verified API material; a successful empty lookup means authoritative absence. |
| An old dispatched version matches the API | Rebase a newer queued edit without mistaking this client's old upload for an external conflict. |
| Older unresolved dispatch survives a newer acknowledgement | Automatically look up API state and retire orphan history. It is not restored as an overwrite choice. Verification failure retains evidence for another run. |
| Local revision changes during lookup | The old result cannot delete or settle the newer edit. |

`SyncRepository.adoptAuthoritativeMaterial()` guards the exact revision, imports the newest observed API version, reapplies pending overlays and refreshes synonym search in one transaction. Typed material identity checks still apply. Old persisted `material-conflict` states are returned to verification by `OwnedSyncEngine`.

Malformed local material or mismatched returned identity can still appear as `invalid-material` / `material-identity-changed` attention. A server validation rejection remains actionable. These are errors to repair or discard, not local-versus-remote choices. Failed lookup never means absence and never authorizes a duplicate POST.

There is no material compare-and-set API. An already dispatched old PUT may still reach the server late; subsequent synchronization follows API truth. Local fencing prevents stale local commits, not a server effect already in flight.

## Regression evidence

`writeReconciliation.test.ts`, `materialReconciliation.test.ts`, `attention.test.ts` and `savedChangesRoute.test.tsx` cover the decision policy, preserved counts, API precedence, authoritative absence, stale decisions, lookup failure, newer edits during lookup, orphan history, and the absence of material overwrite choices. See [the complete verification record](sync-correctness.md) for gates and platform limits.
