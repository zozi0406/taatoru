# Account access and notification UX fixes — 24 October 2026

## Cause and scope

The dashboard displayed the WaniKani API's `The user is hibernating` response
as an unexplained synchronization failure. The API error already carries a
hibernation classification; the presentation was not using it. Tsurukame's
`CommonErrors.swift` also directs users with this account state to sign in on
the WaniKani website. This change does not attempt to clear a server-side account
restriction, change credentials, or alter synchronization behavior.

The Android notification channel passed `sound: 'default'`. In the installed
Expo Notifications implementation, channel sound strings are bundled filenames,
and the native channel manager warns if that resource does not exist. Omitting
`sound` selects `Settings.System.DEFAULT_NOTIFICATION_URI`; `sound: null` keeps
its separate silent channel silent. No new sound asset or native rebuild is needed.

## Changes

- A shared account recovery notice appears for hibernation on the dashboard,
  sign-in form, and initial setup screen. It links to the WaniKani website and
  explains how to retry and check the API token if the account is already active.
- The dashboard also provides Retry sync beside the recovery explanation.
  Existing cached study actions remain available. A successful retry removes
  the notice; unrelated permission failures remain distinct errors.
- Browser-opening failure retains a readable URL and recovery instructions.
- Android channel creation omits the default sound filename. Scheduled content
  uses Expo's explicit boolean sound flag, with the existing audible/silent
  channel selection preserved.

## Verification

- Before the fix: the focused tests reproduced six failures covering the Android
  sound filename, audible/silent content flags, and hibernation presentation.
- After the fix: `npm run verify` passed Expo lint, TypeScript, **253 tests across
  50 suites**, and **13 release configuration checks**.
- Tests cover recovery links, browser failure, sign-in/setup notices, cached
  study actions, clearing the notice after success, unrelated 403 errors, sound
  selection, and the previously existing notification schedule behavior.
- A fresh Android debug-app launch produced **zero missing-custom-sound warnings**
  in cleared device logs. The dashboard's actual hibernation recovery notice was
  visually inspected. Existing account state was preserved; no answers were
  submitted and no credentials were extracted.
- `git diff --check` passed. iOS sound behavior is covered at the Expo adapter
  boundary, but no iOS device/simulator notification-delivery check was run.

The WaniKani account may still require a website sign-in or a valid current API
token. These fixes explain and expose recovery; they do not report a successful
synchronization when the server continues to reject access.

Local screenshots are kept under ignored `.expo/visual-refresh/`.
