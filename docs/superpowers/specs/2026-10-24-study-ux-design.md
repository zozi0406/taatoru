# Review and lesson usability

The user requests working WaniKani-style reviews and lessons, grounded in local Tsurukame and Smouldering Durtles references, including readable explanations, overrides, order customization, and a reliable lesson chooser. Existing visual work stays in place; the two reference repositories remain unchanged.

Observed: a resumed review contains assignment IDs superseded by current assignments. Completion rejects, while its error is outside the safe area. Incorrect answers have no accepted-answer details or explicit continuation. Picker draft saves race with later selections, Begin, and Cancel; selectable row text competes with checkbox taps.

Use the current SQLite/session architecture. Revalidate remaining review assignments before resuming, retaining completed subjects and unchanged attempts. Reject stale completion safely. Place all feedback and actions within safe keyboard-aware content. Keep subject, question type, answer, result, details, and next action together in the familiar WaniKani layout. Correct answers may advance automatically; incorrect answers reveal information and offer Continue, typo override, or a later attempt. Only a completed subject queues progress. Synonyms use the existing study-material write path.

Expose persistent core study settings through the existing settings table: exact matching, overrides, automatic advancement, full information, kana input, question order, batch/return delay and review order/limit; lesson batch, type priority, current-level priority, kana vocabulary and apprentice limit. No new runtime, schema, API credentials, or synchronization redesign. Existing cached preferences are respected.

Lessons share the question controls and readable information, with Previous/Next and a separate quiz. Picker selections remain local; save ordering and repository draft guards protect session creation. Selection is capped at the configured batch and revalidated before starting.

Approach: repair current boundaries and reuse native components. A replacement app or database migration adds risk without addressing the observed causes. Validation combines deterministic tests, persistence integration tests, and real Android interactions (a few reviews authorized by the user); screenshots are ignored local artifacts.
