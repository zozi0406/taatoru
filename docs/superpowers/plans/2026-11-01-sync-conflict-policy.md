# Sync conflict policy follow-up

User-authorized follow-up to the original implementation closed at `4f1b938`.
Use existing repositories, account/lease fencing, scheduler and saved-change route.
No schema or framework change. References stay read-only.

1. Test then implement API-authoritative material conflicts. Compatible field edits still merge; an observed same-field conflict or missing legacy baseline adopts the complete observed API material, including authoritative absence. Successful lookup is required. A newer edit arriving during lookup must survive. Orphaned old-dispatch evidence is verified automatically against the API, never offered as an overwrite choice. Failed verification retains evidence for retry. Retire legacy material-conflict states safely.
2. Test then implement review conflict reporting. A consumed original opportunity with no prior local dispatch becomes a preserved review conflict; an uncertain prior dispatch can still be superseded by proven remote progress without claiming own acceptance. Keeping local means retaining counts on this device; remote choice imports observed server progress and discards the exact local revision. Never rebase old answers onto another cycle.
3. Document every producer and entry path for attention versus actual local/remote conflict. Run complete verification, review scope, commit, push and create the ready PR as already authorized. Monitor its code review and apply relevant fixes. Record Android evidence dates and unsupported checks honestly.

Implementation calls: complete remote material wins on a true same-field conflict; unrelated compatible field changes retain the existing merge. Review history cannot be overwritten through the API, so a local choice preserves evidence rather than promising an unsupported server overwrite.
