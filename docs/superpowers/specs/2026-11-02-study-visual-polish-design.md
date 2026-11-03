# Study visual polish

The user approved all seven visual changes proposed after the release audit.
Retain the current React Native/Expo implementation and subject colors. Make
study compact and calm: a smaller subject hero, clear Meaning/Reading strip,
shared count/progress header, grouped answer feedback, lighter guided lesson
presentation, a compact results card with missed-subject glyphs, and four
settings sections with a persistent Save action.

## Approach

Extend existing shared study components and extract a shared header. This keeps
lessons/reviews consistent without a new design system or dependency. A complete
screen rewrite would put session correctness at unnecessary risk; isolated
cosmetic patches would leave inconsistent controls. The user approved the
cohesive shared-component approach described in the conversation.

## Constraints

- No changes to grading rules, selection, session schema, sync or API behavior.
- Correct auto-advance gets a short, non-interactive success cue after durable
  persistence and before presenting the next question. Failed saves never show
  success. Unmounts must release any timer without another write.
- Preserve existing accessibility labels, checked state, safe areas, large text,
  narrow/short viewports, keyboard access, manual advancement and save retries.
- Secondary lesson details may collapse; required mnemonics remain expanded.
- Settings drafts survive section changes; all settings remain available and
  dirty-close/error handling stays intact. Answers, Reviews, Lessons and Audio
  are the four sections; Save remains available even for a clean draft.
- No dependencies, native regeneration, unrelated fixes, commits or pushes.

## Validation

Focused interaction tests for disclosure, section drafts/save, and success cue
ordering/duplicate prevention; existing study tests; full npm verify. Inspect
synthetic Android lesson/review/settings/results screens with keyboard, light,
dark, large text and landscape. Keep real UI → SQLite → queue → HTTP evidence.
