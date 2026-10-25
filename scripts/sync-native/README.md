# Android fixture runner

Use an isolated emulator data disk. No real WaniKani credentials or account data are required.

1. Run the normal Expo development server on port 8091.
2. Run `node scripts/sync-native/serve.mjs` to serve the test-only manifest on port 8092.
3. Build/install the normal debug native shell with `npm run android -- --no-bundler --device <AVD name>`.
4. Reverse ports 8091 and 8092 with `adb`, then open:
   `exp+taatoru://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8092`.
5. Run native fault checks. They use independently opened Expo SQLite connections and the production lease/transaction boundaries with a controlled fake API.
6. Select **Persist offline completion**, force-stop the app, reopen the fixture entry, then select **Recover after force-stop**. Each Persist action begins a new controlled scenario in `sync-force-stop-fixture.db`.
7. **Open fixture study UI** uses the existing home, picker, lesson and review screens with real repositories in `sync-study-fixture-v2.db`. It seeds 120 lesson candidates. It is intended for offline study/picker/lifecycle checks; its simple fake remote API models the original review subject, not uploads for every generated lesson subject.

The production entry point and authentication code are unchanged. The manifest proxy only redirects the debug client to the test entry; it is not a production mode or credential bypass. Keep result logs limited to scenario identifiers, statuses and counts. Do not use these fixture helpers with a real account database.
