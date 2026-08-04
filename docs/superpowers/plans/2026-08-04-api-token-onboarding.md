# API Token Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Taatoru's bare API-token login form into a guided, secure connection flow that sends new users to WaniKani's official token page and helps them return and connect successfully.

**Architecture:** Keep authentication and synchronization unchanged. `LoginScreen` will own a scrollable onboarding presentation, use Expo Linking for the external browser handoff, and keep browser-handoff feedback separate from the auth error supplied by `AuthProvider`.

**Tech Stack:** React Native 0.86, Expo SDK 57, Expo Linking, React Native Testing Library, Jest 29, TypeScript 6.

## Global Constraints

- Taatoru accepts only a WaniKani personal access token; it never receives an email address or password.
- Open exactly `https://www.wanikani.com/settings/personal_access_tokens` in the system browser.
- Do not add a dependency, clipboard permission, embedded web view, navigation state, analytics event, or alternate credential store.
- Keep token validation, account replacement, SecureStore persistence, and quick synchronization unchanged.
- Keep the complete screen usable on narrow displays, with large text, and with the keyboard open.

---

### Task 1: Guided API-token connection screen

**Files:**
- Modify: `src/features/auth/LoginScreen.tsx`
- Test: `src/features/auth/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: existing `LoginScreenProps` callbacks `onLogin(token: string): Promise<void>` and `onChangeAccount(token: string): Promise<void>`.
- Produces: exported `WANIKANI_TOKEN_URL: string`; an accessible link named `Open WaniKani API Tokens`; separate local browser-error feedback; unchanged token submission callbacks.

- [ ] **Step 1: Write failing content and browser-handoff tests**

Add tests that render `LoginScreen`, assert the password-free explanation and the three numbered instructions, press the accessible link, and verify the exact URL:

```tsx
test('guides a new user through WaniKani token creation', async () => {
  renderLoginScreen();

  expect(screen.getByText(/never sees your WaniKani password/i)).toBeOnTheScreen();
  expect(screen.getByText(/1\. Sign in to WaniKani/i)).toBeOnTheScreen();
  expect(screen.getByText(/2\. Create a token named Taatoru/i)).toBeOnTheScreen();
  expect(screen.getByText(/3\. Copy the token/i)).toBeOnTheScreen();
});

test('opens the official WaniKani token page', async () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce();
  renderLoginScreen();

  await act(async () => {
    fireEvent.press(screen.getByRole('link', { name: 'Open WaniKani API Tokens' }));
  });

  expect(openUrl).toHaveBeenCalledWith(WANIKANI_TOKEN_URL);
});
```

- [ ] **Step 2: Run the focused tests and verify the expected failures**

Run:

```sh
npm test -- src/features/auth/__tests__/login.test.tsx --runInBand
```

Expected: FAIL because the onboarding copy, exported URL, accessible link, and browser call do not exist yet.

- [ ] **Step 3: Implement the minimal guided layout and browser handoff**

In `LoginScreen.tsx`:

- export `WANIKANI_TOKEN_URL` with the exact official address;
- replace the `SafeAreaView` root with a `ScrollView` using `contentInsetAdjustmentBehavior="automatic"`, `keyboardShouldPersistTaps="handled"`, and a padded, centered `contentContainerStyle`;
- explain that the token lets Taatoru connect while the app never receives the WaniKani password;
- add a `Pressable` with `accessibilityRole="link"`, `accessibilityLabel="Open WaniKani API Tokens"`, and `Linking.openURL(WANIKANI_TOKEN_URL)`;
- render the three concise setup instructions and required write-permission guidance;
- label the masked field `Personal access token`, retain its existing accessibility label, and change the submit copy to `Connect account` while keeping `Replace account` for the protected account-change path; and
- add selectable security copy explaining local secure storage and revocation.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```sh
npm test -- src/features/auth/__tests__/login.test.tsx --runInBand
```

Expected: PASS for the new onboarding behavior and the existing authentication tests.

- [ ] **Step 5: Write the failing browser-error test**

```tsx
test('shows the official address when the browser cannot open', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('no handler'));
  renderLoginScreen();

  await act(async () => {
    fireEvent.press(screen.getByRole('link', { name: 'Open WaniKani API Tokens' }));
  });

  expect(screen.getByRole('alert')).toHaveTextContent(WANIKANI_TOKEN_URL);
});
```

- [ ] **Step 6: Run the focused test and verify the expected failure**

Run the focused Jest command from Step 2.

Expected: FAIL because browser rejection does not yet produce local fallback feedback.

- [ ] **Step 7: Implement separate browser-error feedback**

Add local `linkError` state. Clear it before each attempt, catch `openURL`
failure, and render a selectable alert containing:

```text
Couldn't open WaniKani. Visit https://www.wanikani.com/settings/personal_access_tokens in your browser.
```

Keep this alert separate from the existing `error` prop so browser and auth
errors cannot overwrite each other.

- [ ] **Step 8: Preserve and extend submission coverage**

Update the existing masked-input test to press `Connect account`, then add an
account-replacement test that renders `requiresAccountChange={true}`, enters a
token, presses `Replace account`, and verifies only `onChangeAccount` receives
the value.

- [ ] **Step 9: Run focused and full automated verification**

Run:

```sh
npm test -- src/features/auth/__tests__/login.test.tsx --runInBand
npm run verify
```

Expected: all focused tests, lint, TypeScript checking, and the complete Jest
suite pass without warnings or errors.

- [ ] **Step 10: Inspect and commit the scoped implementation**

Inspect `git diff --check`, the complete diff, and `git status --short`. Stage
only the login component, login tests, and this plan, then commit:

```sh
git add src/features/auth/LoginScreen.tsx src/features/auth/__tests__/login.test.tsx docs/superpowers/plans/2026-08-04-api-token-onboarding.md
git commit -m "feat: guide API token onboarding"
```

### Task 2: Android onboarding verification

**Files:**
- No source-file changes expected.

**Interfaces:**
- Consumes: the completed `LoginScreen` from Task 1 and the dedicated Taatoru Android emulator.
- Produces: manual evidence that the external-browser handoff and responsive screen work on a real Android runtime.

- [ ] **Step 1: Launch the existing development build on the dedicated emulator**

Use the configured Node 22 runtime for repository commands. Reuse the dedicated
`Taatoru_API_36_1` AVD, or create a new Taatoru-specific AVD if it is not
available, so another app's emulator session is not disturbed.

- [ ] **Step 2: Verify the primary onboarding route**

Confirm the full copy is readable, press `Open WaniKani API Tokens`, verify the
system browser opens the official page, return to Taatoru, paste a controlled
test token through the native paste menu, and connect successfully.

- [ ] **Step 3: Verify responsive and alternate states**

Check scrolling with the keyboard open, dark theme, large text, invalid-token
feedback, and the existing account-replacement state. Confirm the token remains
masked and neither the token nor the WaniKani password appears in logs.

- [ ] **Step 4: Record final repository state**

Run `git status --short` and report the exact automated and emulator checks
performed, including any limitation that prevented a check from running.
