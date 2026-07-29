# Taatoru

Taatoru is a working-title Android-first Expo client for WaniKani. It is being
built as a local-first application with lessons, reviews, search, analytics,
notifications, and synchronization behavior characterized against Tsurukame.

## Development

Use Node.js 22 LTS:

```sh
npm install
npm run android
```

The supported release toolchain remains Node 22 (`.nvmrc` and
`package.json`). Foundation development through the authentication milestone
was also run successfully with Node 26.5.0; that newer runtime is convenient
for local work but is not yet the release or CI baseline.

The generated `android/` and `ios/` projects are intentionally untracked.

## Credits and license

Taatoru is licensed under the Apache License, Version 2.0. It incorporates and
adapts portions of [Tsurukame](https://github.com/davidsansome/tsurukame),
which is also licensed under Apache 2.0. See [NOTICE.md](NOTICE.md) for details.

WaniKani content is loaded from the WaniKani API. Taatoru uses only
WaniKani-provided `visually_similar_subject_ids` for visually similar kanji.
