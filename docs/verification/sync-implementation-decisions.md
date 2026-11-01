# Sync implementation decisions

Original direction, closed 1 November 2026. Decisions are in execution order; costs are retained for review.

- Ruling: native worktree creation cannot target this nested repository (Not a git repository); work on a new dedicated branch in the clean checkout — preserves all committed study-UX work — cost if wrong: no simultaneous checkout isolation, so verify status before commits.

- Ruling: task 1 ports regressions when their fixing task begins rather than leaving a red main suite — plan explicitly permits this — cost if wrong: preserve audit-case mapping in verification matrix until all tests exist.

- Task 3: Ruling: isolate lease lifetime in OwnedSyncEngine instead of expanding the pure orchestration engine — raw orchestration remains independently testable; all production construction sites now use owned execution — cost if wrong: a future constructor must use the owned boundary, covered by runtime integration review.

- Task 6: Ruling: preflight is a focused SyncPreflight class called by every owned run — avoids coupling the pure engine to DB internals — cost if wrong: future entry points must use OwnedSyncEngine, which runtime wiring/review checks.

- Task 6: Ruling: confirmed resets invalidate saved sessions containing affected subjects while retaining completed outbox work and unrelated sessions — old half-answered prompts cannot identify a new opportunity safely — cost: a mixed affected session restarts its uncommitted prompts after reset. Late callbacks now fail the atomic saved-session check.

- Task 6: Ruling: reset events use sync_resets rather than only the latest timestamp — distinguish reset levels/times for pending work — cost: one small account-owned table in the additive migration.

- Task 7/8: Ruling: reconciler and settlement receive an already fenced database rather than repeating a lease parameter on every method — production ownership is enforced inside each transaction by FencedDatabase — cost if wrong: direct production construction with an unfenced DB would bypass this boundary, checked at runtime wiring review.

- Task 8: Ruling: retain newer acknowledged material payloads while older dispatches remain unresolved — WaniKani has no conditional PUT and an expired owner's late request can overwrite remote values — cost: unresolved histories require attention/explicit resolution and consume local storage until resolved; tests preserve both versions without claiming remote ordering guarantees.

- Task 9: Ruling: upload at most eight operations per resource refresh, with capacity reserved for both queue types, then let the coordinator drain further batches — actual HTTP pacing replaces guessed page-count budgets and downloads keep progressing — cost: large backlogs repeat incremental preflight/download reads, an efficiency tradeoff rather than silently leaving work pending.

- Task 9: Ruling: initial setup retains AuthProvider's existing retry timer; its shared coordinator has automatic foreground retries disabled until authenticated — avoids two competing setup retry loops — cost if wrong: a missed authenticated foreground signal could defer remaining work until the next explicit sync/reconnect; startup and lifecycle wiring are verified separately.

- Task 10: Ruling: bind the existing repositories through an account-scoped Database supplied to authenticated routes instead of adding account parameters to each repository method — one checked transaction boundary also covers synonym edits, settings, picker and Finish callbacks — cost if wrong: a route using the raw bootstrap service would bypass local write fencing, covered by provider wiring and stale-screen tests.

- Task 10: Ruling: keep uncertain legacy/reset progress for an explicit saved-change decision rather than guessing a fresh baseline — prevents replay into a new opportunity — cost: some historical offline work cannot be uploaded automatically; its counts and local evidence remain until the user discards it.

- Task 11: Ruling: fixed-seed generation concentrates on material durability while dedicated session/API/account/ownership/coordinator fault cases cover the ten invariants — avoids asserting irrelevant invariants vacuously after material-only events — cost: this is not a general mixed-event model checker.

- Final: Ruling: first review with absent old and current statistics at stage 1 may retry only on the unchanged assignment opportunity — the official API creates review statistics on the first review — cost if wrong: an inconsistent server observation could require attention; null-to-positive, missing established statistics and changed identities fail closed.

- Final: Ruling: discovery of a confirmed reset invalidates all saved sessions containing affected subjects, regardless of local creation time — offline sessions and clock skew cannot prove observation of the reset — cost: uncommitted prompts in an otherwise compatible affected session may restart once.

- Final: Ruling: interrupted credential setup resumes its cache rather than clearing partial data — identity is revalidated before any replacement and saved work survives — cost: incremental reads may repeat instead of a clean initial download.

- Final: Ruling: later API-authoritative material-conflict preference remains a separate follow-up — user explicitly requested wrapping the original direction first — cost: the original conflict UI is not the final requested product policy and must not be published as that policy.

- Final: Ruling: no global ordering or mathematical exactly-once server guarantee is claimed — the API has no material CAS or documented review idempotency key — cost: late remote effects remain possible despite local fencing and preserved evidence.

- Final: Ruling: exact OS scheduling and iOS parity remain unverified — Android emulator evidence cannot establish those environments — cost: physical-device and platform-specific background defects remain possible.

Deferred minors: none.
