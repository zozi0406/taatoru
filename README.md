# Taatoru

Taatoru is a working-title Android-first Expo client for WaniKani. It is being
built as a local-first application with lessons, reviews, search, analytics,
notifications, and synchronization behavior characterized against
[Tsurukame](https://github.com/davidsansome/tsurukame).

## Development

Taatoru builds with Node.js 22 LTS only:

```sh
npm install
npm run android
```

The generated `android/` and `ios/` projects are intentionally untracked.

## Credits and license

Taatoru is licensed under the Apache License, Version 2.0. It incorporates and
adapts portions of [Tsurukame](https://github.com/davidsansome/tsurukame),
which is also licensed under Apache 2.0. See [NOTICE.md](NOTICE.md) for details.

WaniKani content is loaded from the WaniKani API. Taatoru uses only
WaniKani-provided `visually_similar_subject_ids` for visually similar kanji.
