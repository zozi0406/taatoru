# PR 6 follow-up review

2 November 2026. Reviewed PR #6 at `93330d2`. There were no unresolved review threads, the automated review reported no findings, and remote CI was passing. Direct review found two mock-server defects:

1. Response serialization replaced the fixture origin throughout JSON, corrupting notes and synonyms containing that literal URL when the server used an ephemeral port. Serialization now localizes only explicit API link fields; authored text round-trips unchanged through write receipts, targeted reads and bootstrap resources.
2. Reset cleared journals/faults and released held responses before validating the replacement scenario and seed. The replacement is now validated and constructed first. A rejected reset preserves the account/run identity, accepted mutation evidence, armed faults and held responses.

Scenario validation also now checks owned preset names, rejecting inherited object properties such as `constructor` and `toString` at the server, factory and CLI/runner boundaries.

Regression verification:

- Observed both HTTP failures before implementation: a note's URL changed to the ephemeral port, and an invalid reset erased the accepted-write journal.
- Observed inherited-name validation failures before implementation.
- Focused HTTP, factory, runner and real delivery integration checks: **49 tests passed**.
- Full `npm run verify` under Node 22: **476 tests / 79 suites**, lint, TypeScript, release configuration and tooling checks passed.
- `git diff --check`: passed.

Changes affect the host-side mock/runner only. Application and native transport code, fault expectations and existing device assertions are unchanged. The prior 13 Android suites and five native HTTP tests were not repeated for this host-side follow-up; their evidence remains in `mutation-sync-fixes.md`.
