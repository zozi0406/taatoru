# Initial Sync and Connectivity Retry Design

## Goal

Give a first-time user a clear, reassuring view of Taatoru preparing its local
WaniKani library, and reliably retry durable pending uploads when connectivity
returns without creating duplicate requests, request storms, or avoidable API
traffic.

The experience takes its behavioral cues from Smouldering Durtles' first-time
setup and live synchronization progress, while using Taatoru's visual language
and existing synchronization architecture.

## Scope

This change adds:

- a dedicated initial-sync state after token validation;
- a modern animated tracker backed by real synchronization phases;
- an interrupted-setup recovery dialog on a later app launch;
- recoverable connection-issue and other failure states;
- automatic initial-sync continuation after connectivity returns; and
- a connectivity-triggered quick sync when durable pending uploads exist.

It does not add exact entity-level percentages, polling, a permanent background
loop, a new job framework, or a second upload implementation. Existing token
validation, SecureStore persistence, SQLite queues, synchronization budgeting,
and API error handling remain authoritative.

## Initial Sync Experience

After WaniKani accepts the submitted token, the connection form transitions to
a dedicated `Preparing your library` view. The screen explains that the first
sync can take a minute and that later starts will be faster because Taatoru is
building offline access.

The tracker contains four ordered steps:

1. Account connected
2. Downloading subjects
3. Syncing progress and study data
4. Preparing offline access

The steps reflect real work rather than elapsed-time estimates. Token
validation completes the first step. Synchronization phase one activates the
subject step, phase two activates account-data synchronization, and finalizing
activates offline-library preparation. Authentication completes only after the
existing cache and completed-sync checks succeed.

Completed steps transition to checkmarks. The active row uses a restrained
pulse and the progress rail animates between phase positions. Screen and row
transitions use short opacity and position changes. All custom motion respects
the operating system's reduced-motion preference; the status text and icons
remain sufficient without animation.

The screen is scrollable and safe for narrow displays, large text, and system
insets. Status text uses an accessibility live region. State is never conveyed
through color or animation alone.

## Interrupted Setup Recovery

After WaniKani validates a token and before the first synchronization starts,
Taatoru stores it under a separate pending-setup key in SecureStore. This key
does not authenticate the user or grant access to the protected app. Successful
initial synchronization promotes it to the active-token key and removes the
pending key.

If Taatoru launches with a pending setup token and no completed initial-sync
marker, it treats the previous setup as interrupted. It does not automatically
continue or make an API request. Instead, an accessible dialog titled `Setup
was interrupted` explains that the incomplete local download may be stale and
asks how to proceed.

The dialog offers:

- `Continue syncing`: atomically clears all partially downloaded account data
  and synchronization cursors while preserving app preferences, retains the
  pending token in SecureStore, closes the dialog, and begins a fresh initial
  sync through the guarded retry path; and
- `Use another API key`: atomically clears the partial account data and
  synchronization cursors, removes the pending token, and returns to the token
  onboarding form with an empty field.

The destructive scope is limited to incomplete account cache data. It does not
reset theme or study preferences. During first-time setup there can be no valid
pending lesson/review uploads or active sessions for that incomplete account;
the same account-data clear nevertheless removes those tables so no partial
state can cross into the restarted generation.

Repeated app launches continue to show the choice until the user selects an
action. Connectivity callbacks are ignored while the dialog is awaiting a
decision, so reopening the app cannot silently start requests.

## Connection and Error States

If initial synchronization cannot proceed because the device is offline or a
network request fails, the title becomes `Connection issues`. Supporting text
explains that Taatoru will continue automatically when connectivity returns.
The cached partial download is left intact so the next attempt can resume from
the existing synchronization cursors.

The screen offers:

- `Retry now`, which uses the same guarded retry path as automatic recovery;
  and
- `Use a different token`, which clears incomplete account data and cursors,
  removes the pending SecureStore credential, and returns to the connection
  form.

Non-connectivity failures use `Setup needs attention`, preserve a safe error
message, and expose the same actions. Rate-limited responses show their safe
retry timing and do not retry before the server-provided time.

The token remains only in the masked input/in-memory authentication flow and
the dedicated pending SecureStore key until initial synchronization succeeds.
It is not placed in navigation parameters, ordinary storage, logs, analytics,
or error messages. The active-token SecureStore key is written only after
successful initial synchronization.

## Retry Coordination and Request Control

All initial-sync retries pass through one coordinator. It enforces:

- a single in-flight attempt;
- disabled retry controls while that attempt is running;
- an offline-to-online rising edge rather than every network-state callback;
- a two-second stability debounce before an automatic retry;
- a sixty-second minimum cooldown between automatic attempts;
- a five-second minimum cooldown between manual retry launches; and
- any later server-provided `retryAt` time.

Repeated online callbacks are coalesced. Connectivity changes during an
in-flight attempt do not queue additional attempts. A failed automatic attempt
does not loop while the device remains online; another attempt requires an
explicit user action or a later genuine offline-to-online transition after the
cooldown. Manual retry uses the same single-flight and rate-limit gates, so
repeated taps cannot create parallel requests.

These controls protect both the user's WaniKani request budget and Taatoru from
large bursts during unstable connectivity.

## Pending Upload Recovery

While an authenticated app process is running, Taatoru observes connectivity
state changes. On a genuine transition from offline to reachable internet, it
waits for the connection-stability debounce and checks SQLite for pending
progress or study-material rows.

If the queue is empty, no API request is made. If work exists, the coordinator
starts one existing quick synchronization. This retains current request-budget
selection, upload ordering, stale-write handling, synchronization locking, and
post-upload cache reconciliation. It also avoids maintaining a separate
upload-only networking path.

Automatic reconnect synchronization is single-flight and has a minimum
cooldown. It does not poll, recursively retry, or schedule one request per
pending row. The existing quick-sync budget selects a bounded batch, and any
unsent or failed rows remain durable for a future startup, manual sync, or
later reconnect.

Authentication-time initial sync and authenticated reconnect retry use the
same connectivity semantics but separate eligibility rules: initial setup
retries only while setup is incomplete, and pending-upload recovery runs only
after authentication with a non-empty durable queue.

## Architecture

The synchronization engine's existing store remains the source of real phase
events. The authentication manager subscribes to the engine used for initial
sync and reports a small semantic setup-progress model to `AuthProvider`.
Presentation consumes that model without knowing API or database details.

The authentication context and token store distinguish pending setup from an
active authenticated credential. The context owns interrupted-setup decisions,
retry, and reset actions so presentation cannot bypass cache clearing,
validation, or synchronization checks.

A small connectivity retry coordinator owns edge detection, debounce,
single-flight behavior, cooldown, and `retryAt` enforcement. It is independent
of React and Expo so its timing rules can be tested deterministically. A thin
Expo Network subscription adapts network callbacks into that coordinator.

The app services layer checks the durable pending-row count before invoking the
existing quick synchronization. It does not construct parallel sync engines
for reconnect events.

## Failure and Lifecycle Behavior

- Killing the app during initial synchronization leaves a pending setup token
  in SecureStore. On the next launch Taatoru shows the interrupted-setup dialog
  and makes no request until the user chooses. Continuing clears the incomplete
  cache and restarts from empty cursors; choosing another key clears the cache
  and pending credential.
- Killing the app during a reconnect upload leaves unacknowledged queue rows in
  SQLite. Existing retry and stale-write reconciliation behavior applies on the
  next attempt.
- Leaving the app in the background does not create a polling loop. Network
  callbacks are opportunistic; durable rows remain the source of truth.
- Signing out or replacing the account retains the existing explicit account
  clearing behavior.

## Testing

Test-first coverage will verify:

- each real sync phase maps to the correct visible tracker step;
- completed, active, connection-issue, attention, and reduced-motion states
  remain understandable and accessible;
- Retry now and automatic reconnect use the same single-flight path;
- Use a different token clears incomplete account state and returns to the form
  without retaining the pending token;
- reopening with a pending setup token and no completed-sync marker shows the
  interrupted-setup dialog without making an API request;
- Continue syncing clears every partial account table and cursor before the
  first restarted request;
- Use another API key clears the partial cache and pending SecureStore key;
- repeated online callbacks produce one attempt;
- flapping connectivity is debounced and cooldown-limited;
- callbacks during an in-flight attempt do not queue another attempt;
- `retryAt` prevents premature automatic and manual attempts;
- an empty pending queue produces no synchronization call;
- a non-empty queue produces one quick sync after a real offline-to-online
  transition; and
- failed retry leaves durable pending rows untouched.

Focused Jest tests will run during development, followed by lint, TypeScript
checking, and the full Jest suite. Android verification will cover the initial
sync transition, animation, connection loss and recovery, repeated Retry taps,
process termination and interrupted-setup recovery, dark theme, large text,
reduced motion where practical, and a queued offline completion uploading once
when connectivity returns. A production Android bundle export will provide the
final build-level check.
