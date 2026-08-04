# API Token Onboarding Design

## Goal

Help a first-time WaniKani user connect Taatoru without already knowing what an
API token is, while keeping WaniKani credentials out of Taatoru. Activation is
complete when the user has opened WaniKani's token page, returned with a token,
and successfully connected their account.

## Scope

Replace the current bare token form with one guided, scrollable connection
screen. Taatoru continues to accept only a WaniKani personal access token and
continues to validate, store, and synchronize it through the existing auth
flow. Email/password login, embedded web authentication, OAuth emulation, and
automatic clipboard access are out of scope.

## User Experience

The screen will:

1. Introduce the action as "Connect WaniKani" and explain that Taatoru uses an
   access token instead of receiving the user's WaniKani password.
2. Present "Open WaniKani API Tokens" as the first action. It opens
   `https://www.wanikani.com/settings/personal_access_tokens` in the system
   browser.
3. Show three concise steps: sign in to WaniKani, create a token named
   "Taatoru" with the lesson/review/study-material permissions Taatoru needs,
   then copy it and return to the app.
4. Place a masked field labelled "Personal access token" directly below the
   instructions, followed by the existing connect or account-replacement
   action.
5. Explain that the token is stored securely on this device and can be revoked
   from WaniKani at any time.

The screen will use a `ScrollView` so the complete flow remains usable with
large text, a narrow display, or an open keyboard. All controls will have
explicit accessibility roles and labels; selection will not rely on color.

## Architecture and Data Flow

`LoginScreen` owns only presentation and the external browser handoff. The
official token-page URL will be exported as a constant so the destination is
easy to test and update. Pressing the external-link control calls Expo
Linking's `openURL`.

Token submission remains unchanged: `LoginScreen` passes the entered value to
the supplied auth callback, and `AuthManager` trims it, calls WaniKani's `/user`
endpoint, protects existing account data, stores the accepted token in
SecureStore, and starts a quick synchronization.

No token, cookie, email address, or password is added to navigation state,
logs, analytics, or ordinary storage.

## Error Handling

If the system cannot open the WaniKani page, the screen will show a local,
selectable fallback message containing the official address. This error is
separate from token-validation and account-change errors so one action cannot
erase the other action's useful feedback.

While authentication is busy, token editing and submission remain disabled.
The browser link remains available because it neither mutates account state nor
starts a competing authentication request.

## Testing

Component tests will verify that:

- the screen explains the password-free connection and displays all three
  setup steps;
- the external-link control opens the exact official WaniKani token URL;
- a failed browser handoff exposes the fallback URL;
- the token field remains masked and submits its value through the existing
  callback; and
- the account-replacement label and behavior remain intact.

After the focused component tests pass, run lint, TypeScript checking, and the
full Jest suite. Finally, check the flow on the dedicated Android emulator for
scrolling, browser return, native paste, successful connection, dark theme,
and large text.
