# Synchronization reference and regression matrix

Implementation starts 25 October 2026 from Taatoru e406d41. Baseline: 57 suites / 305 tests passed under Node 22. Reference source trees stay read-only.

| Behavior | Reference protection / limitation | Taatoru release requirement | Evidence |
|---|---|---|---|
| Durable completion | Tsurukame atomically queues; Durtles has an observed completion-to-enqueue crash window | Keep session snapshot and immutable operation in one transaction | Existing session repository rollback tests; new migration/fault tests pending |
| Online delivery | Tsurukame sends immediately; Durtles schedules durable tasks | Enqueue, resume and reconnect drive eventual draining | Coordinator tests pending |
| Shared ownership | Durtles uses a shared task monitor; Tsurukame guard excludes direct sends | Independent connections cannot dispatch/commit as competing owners | Control/fencing tests pending |
| Refresh and pending work | References upload first; quota/parallel paths have limits | Quick/full refresh retains pending projection and effective notes | Pending overlay tests pending |
| Pagination | Tsurukame uses moving watermark; Durtles replays an hour | Follow actual pages, conservative watermark, replay and version checks | API regression tests pending |
| Pacing | Durtles averages one request per 1.1 seconds | Pace all HTTP traffic and persist quota deadlines | Request scheduler tests pending |
| Reset/hidden transitions | Durtles fetches assignment transitions; Tsurukame filters can miss removals | Preflight resets and preserve hidden/locked updates | Reset tests pending |
| Ambiguous/rejected progress | Both references discard every 422 | Reconcile opportunity, preserve unresolved work and isolate poison items | Reconciliation tests pending |
| Material creation | Tsurukame looks up remote ID; status handling is weak | Receipt/lookup IDs, immutable old dispatch, newer edits preserved | Material tests pending |
| Answer persistence | Current study-UX supplies synchronous submit guards | Preserve mistake counts, cancellation and offline Finish | Screen and fault tests pending |
| Account lifecycle | Reference account handling has known gaps | Versioned credentials and fenced teardown prevent old callbacks committing | Auth tests pending |

API constraints: review history is unavailable; no documented review idempotency key or material compare-and-set; background scheduling is controlled by the OS. These limits cannot be replaced by claims of exactly-once delivery or globally conflict-free edits.
