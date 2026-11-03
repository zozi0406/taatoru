# Taatoru — Ivory & petrol

App-wide design extension of the approved lesson/review concept. This document specifies proposed UI and defaults; it does not change saved preferences.

## Shared visual language

Ivory canvas #F7F4ED, white surface #FFFEFA, ink #202C2B, muted text #52635F, petrol action #174E52, border #D9DFD8. Use classic subject colors for radical, kanji, vocabulary and kana-vocabulary identity, and existing labelled SRS colors for progress. Provide textual labels and icons alongside color. Dark mode uses the existing study palette adaptation, with light petrol actions on dark neutral surfaces.

Use 16px body text, scalable headings, 48px touch targets and 16–24px page padding. Prefer flat grouped surfaces and separators. One filled primary action per task, outlined secondary actions, quiet tertiary actions. Root navigation stays Home, Search, Analytics, Settings. Detail pages use Back. Respect safe areas, keyboard space, large text and narrow screens.

## Screens

- Home preserves the existing structure: wordmark and level badge, daily-study heading, side-by-side Lessons and Reviews action tiles, Choose your lessons row, Next 24 hours forecast, Level progress, SRS distribution and sync footer. Lessons uses pale petrol with dark text; Reviews uses solid petrol with white text. Keep the existing zero-count disabled states. Forecast bars use petrol, level meters use subject colors, and SRS distribution uses labelled stage colors. This replaces the earlier stacked-action and oversized-counter proposals.
- Search uses one search field, compact type filters and flat subject rows with colored glyphs, type labels and meaning. Keep existing filters and navigation. Distinguish no results from loading and errors.
- Subject details extend the study hero, with meaning and reading sections separated by rules. Audio is a small labelled action. Notes and synonyms use focused edit screens with Save as the primary action. Preserve existing mnemonic, context and component information.
- Analytics retains its existing sections and calculations. Use petrol for neutral charts, subject colors for type breakdowns and SRS colors only for stage breakdowns. Include labels with charts and meaningful empty states.
- Lesson picker groups existing available items, gives selected rows a checkmark and petrol outline, and pins the selected count plus Begin action at the bottom. Empty selection disables Begin. Keep availability and limit validation.
- Completion uses a concise count and result summary with one Return home action. Missed subjects remain inspectable.
- Login uses a plain introductory heading, token field and one Connect action. Initial sync displays progress and a retry action on failure.
- Sync attention and offline states use a compact status row, with details and retry available when relevant. Never display a successful sync while changes still need attention.

## Settings hierarchy

Replace Answers / Reviews / Lessons / Audio tabs with an index and focused subpages. Root displays supported account information, Lessons, Reviews and account actions. Omit Tsurukame categories with no equivalent controls in Taatoru. Retain existing account and recovery capabilities in their appropriate surfaces.

Lessons follows Tsurukame's ordering: batch size, lesson order, prioritize current level, apprentice limit, kana-only vocabulary. Order opens a reorderable list. Numbers open a compact selection page instead of rendering every choice inline.

Reviews follows Tsurukame's grouping:

1. Review session — enable limit, then reveal limit value when enabled.
2. Order — random/order selector, Back-to-back switch, conditional meaning-first/reading-first order or mixed-question pool size, incorrect-answer repeat delay.
3. Answers & marking — reveal full answer, exact match, allow overrides, allow skipping. Preserve Taatoru's auto-advance and kana-input controls with accurate names; these are not equivalent to Tsurukame's reveal-answer or keyboard-switch settings.
4. Audio — automatic pronunciation.

In-session controls use a compact secondary menu for Ask again later, Wrap up and Study settings. Preserve the existing disabled states during saves and after grading. Explain skipping's reset behavior at the action, and expose the wrapping-up status in the study header.

## Proposed fresh-install defaults

| Setting | Proposed default |
| --- | --- |
| Lesson batch | 5, honoring existing account preference when supplied |
| Lesson type priority | Radical, kanji, vocabulary |
| Prioritize current level | Off |
| Kana-only vocabulary | On |
| Apprentice limit | Off |
| Review order | Random |
| Back-to-back questions | Off, mapped to Taatoru mixed mode |
| Mixed-question pool | 5 |
| Incorrect-answer delay | 5 |
| Review limit | Off; suggested value 15 when enabling |
| Reveal full answer | Off |
| Exact match | Off |
| Overrides | On |
| Skipping | Off |
| Automatic pronunciation | Off |

Tsurukame's local Settings.swift and settings controllers are the behavior references. Mixed mode is an analogous setting, not a claim of identical scheduling algorithms. Preserve existing saved values. Tsurukame's automatic answer reveal and Taatoru's automatic advance have different meanings. Keep that distinction explicit in implementation and labels. Do not infer equivalent semantics from similar setting names.

## Implementation checks

Verify grouped settings navigation, persistence, discard handling and return to an active session. Exercise default mixed scheduling using controlled data. Compare actual Android screens with the approved reference in light/dark mode, large text and keyboard-visible states. Validate the main study flows and sync behavior with the existing synthetic harness.
