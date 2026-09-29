# Todo App Phase 3 — Offline-First Local Cache + Sync Engine

Status: Approved for planning
Date: 2026-09-29

## Context

Phase 2 (see [2026-09-29-todo-phase2-expo-web-design.md](2026-09-29-todo-phase2-expo-web-design.md)
and its implementation plan) migrated the app to Expo, added a shared
web/mobile UI, and wired it up to the Phase 1 backend **online-first**:
every mutation in `src/storage/taskStorage.ts` calls the API directly and
rejects on failure, with no network-state awareness, no persisted queue,
and no retry. `app/index.tsx` responds to a rejected mutation with an
`Alert` telling the user to check their connection and try again — there
is no path back to success other than the user manually redoing the
action once back online.

Phase 2's design doc explicitly deferred this: "Phase 3 (a later spec)
adds an offline-first local cache and background sync engine on top of
this." This spec is that Phase 3.

The Phase 1 backend has no delta/changes-since endpoint and no
soft-delete/tombstones — `GET /tasks` always returns the user's full,
current list, and `DELETE /tasks/:id` is a hard delete. `PATCH`/`POST`
responses and list rows carry `updatedAt`, though the frontend currently
drops it when mapping `TaskResponse` to `Task` (`src/api/tasks.ts`).

## Goals

- Every task mutation (create, update, delete, toggle) applies
  immediately to a local, durable cache and succeeds from the user's
  perspective regardless of connectivity — no more "could not save,
  check your connection" for a plain offline case.
- A persisted, ordered mutation queue captures pending changes and
  drains them automatically once connectivity returns, without the user
  re-entering anything.
- The full task list re-syncs against the server (pull + diff) on app
  foreground and on network reconnect, reconciling remote adds/removes
  and same-task edit conflicts via last-write-wins.
- The Android widget's toggle action shares the same offline-safe queue
  as the main app — a toggle made from the widget while offline is no
  longer silently lost.
- A task with a not-yet-confirmed local change is visibly marked
  "pending" in the task list.
- `TaskEditorModal`, `LogoMark`, `src/theme.ts`, and the recurrence/
  selector utilities require **no changes**. `TaskRow` gets exactly one
  new optional prop (a pending indicator) and is otherwise unchanged.

## Non-goals (explicitly out of scope for Phase 3)

- True OS-level background execution (background-fetch/WorkManager/
  BGTaskScheduler). Sync runs only while the app is foregrounded or just
  regained connectivity/focus — see "Sync triggers" below.
- Backend changes of any kind. No delta endpoint, no tombstones, no
  `version` column. Sync is a full-list pull + client-side diff against
  the last-known-synced local snapshot.
- Field-level/CRDT-style merge for same-task conflicts. Conflicts
  resolve whole-record, last-write-wins by `updatedAt`.
- A manual "retry now" / "view sync errors" UI beyond the pending
  indicator and the existing connection-error `Alert`s.
- iOS-specific testing (unchanged from Phase 2's non-goals).

## Module layout

New `src/sync/` directory:

- **`localTaskCache.ts`** — durable AsyncStorage-backed store
  (`@todo_app/local_task_cache`) holding the last-known-synced server
  state (each task including its server `updatedAt`). Replaces today's
  in-memory-only `cache` variable inside `taskStorage.ts`.
- **`mutationQueue.ts`** — an ordered, persisted list of pending
  operations (`@todo_app/mutation_queue`), with `enqueue`, `list`/
  `drain`, and `remove` operations, plus an id-remap helper (see
  "Create id remapping" below).
- **`syncEngine.ts`** — drains the queue against the API, then pulls the
  full list and diffs it against `localTaskCache`. Exposes `syncNow()`
  and `subscribeToSyncStatus()` (idle / syncing / error, plus the
  current pending-mutation count, used to compute each task's `pending`
  flag and to gate logout).

`taskStorage.ts` keeps its exact existing public API — `getTasks`,
`addTask`, `updateTask`, `deleteTask`, `toggleTaskComplete`,
`subscribeToTasks`, `clearLocalTaskCache` — and becomes a thin
orchestrator: each mutator applies its change to `localTaskCache`
immediately, enqueues a `QueuedMutation` via `mutationQueue`, and kicks
`syncEngine.syncNow()`. `app/index.tsx`, `TaskEditorModal`, and
`widget-task-handler.ts` need no interface changes.

New dependency: `@react-native-community/netinfo` (has a web-compatible
implementation) for reconnect detection. App-foreground detection uses
React Native's built-in `AppState`, which also works under
`react-native-web`.

## Data model

```ts
// src/sync/mutationQueue.ts
interface QueuedMutation {
  id: string;              // uuid, client-generated; used for de-dup/removal
  type: 'create' | 'update' | 'delete' | 'toggle';
  taskId: string;           // real server id, or a client temp id ("tmp_<uuid>") for a not-yet-synced create
  payload?: Partial<NewTaskInput>;  // create/update only
  clientTimestamp: string;  // ISO 8601, captured when the user acted; used for LWW comparison
}
```

`src/types/task.ts`'s `Task` gains:

```ts
updatedAt: string;    // already returned by the backend; api/tasks.ts's toTask() currently drops it — stop dropping it
pending?: boolean;    // derived, not persisted server-side; true while taskId has a queued mutation
```

`api/tasks.ts`'s `toTask()` is updated to carry `updatedAt` through from
`TaskResponse`. A locally-created task is assigned a temp id
(`tmp_<uuid>`, generated client-side) and `pending: true` until its
`create` mutation succeeds.

### Create id remapping

When a queued `create` mutation succeeds, the server assigns the real
task id. `mutationQueue`'s drain step then rewrites `taskId` on every
*other* still-queued entry that referenced the old temp id (e.g. the
user edited or toggled a task they just created, while still offline),
and `localTaskCache` replaces the temp-id row with the server's real row
in place.

## Mutation flow (optimistic apply)

Every `taskStorage.ts` mutator:

1. Computes the new task state and applies it to `localTaskCache`
   immediately, notifying `subscribeToTasks` listeners synchronously —
   before any network call is attempted or resolved.
2. Enqueues a `QueuedMutation` describing the change.
3. Calls `syncEngine.syncNow()` (fire-and-forget) to attempt immediate
   delivery if online; does not await it.

Because the mutation applies locally regardless of connectivity, these
functions now resolve (not reject) for the ordinary offline case. They
still reject for genuine errors — a validation error the server returns
once a queued mutation finally drains, or (per `clearLocalTaskCache`'s
existing contract) storage-layer failures.

### `toggleTaskComplete` special case

Unlike the other three mutators, `toggle` is not a plain field write —
the backend's `/tasks/:id/toggle` computes recurrence rollover
(`computeNextDueDate`) and appends/removes today's date from `history`
server-side. The frontend already has the identical `computeNextDueDate`
function (`src/utils/recurrence.ts`) — Phase 1's backend service module
comment even notes it "mirrors the frontend's toggleTaskComplete
semantics exactly." `toggleTaskComplete` runs this same computation
locally to produce the optimistic result, then enqueues a `toggle`
mutation (no `payload`, just `taskId` — the server recomputes
independently from its own state when the mutation drains).

**Known, self-correcting edge case:** if a queued `toggle` sits
unsynced across a day boundary, the server computes "today" at replay
time, which can differ from the optimistic client-side guess made at tap
time. The result: the optimistically-shown state may briefly disagree
with what the server ultimately records. This resolves itself once the
`toggle` mutation drains (§ "Sync engine," `syncNow()` step 3), since the
drained response is applied directly and is authoritative. No data is
lost; the worst case is a stale on-screen state for one sync cycle.

## Sync engine

### Sync triggers

- Immediately after any mutation is enqueued (debounced to coalesce
  bursts, e.g. rapid edits).
- `AppState` transitioning to `active`.
- `NetInfo` reporting a transition from offline to online.

No polling interval, and no OS-level background execution — sync only
runs while the app is foregrounded or has just regained focus/
connectivity, per the "foreground/reconnect, not true background" scope
decision.

### `syncNow()` algorithm

Skipped entirely (no-op) if `NetInfo` currently reports offline.

**Correctness constraint driving this order:** the backend's update/
toggle endpoints (`backend/src/db/tasks.ts`) perform an unconditional
overwrite — there is no `updatedAt` guard or optimistic-concurrency
check, and adding one is out of scope (no backend changes). That means
last-write-wins can only be enforced **before** a queued mutation is
sent — once sent, it always wins unconditionally, with no server-side
comparison ever happening. So the server's current state must be
fetched *before* draining, not after.

1. **Pull the full list first** (`fetchTasks()`), giving each task's
   current server `updatedAt`.
2. **LWW-filter the queue against that pull.** For each `QueuedMutation`
   of type `update` or `toggle`: if the server response contains that
   `taskId` with `updatedAt` later than the mutation's
   `clientTimestamp`, **drop** the mutation (someone else's edit is
   newer; discard the stale local one) without sending it. `create` and
   `delete` mutations are never dropped here — a `create` has no server
   row yet to compare against by definition, and a `delete`'s intent
   ("this task should not exist") always takes precedence over a
   concurrent edit to the same task.
3. **Drain the surviving queue, in order.** For each remaining
   `QueuedMutation`, call the matching `api/tasks.ts` function and apply
   its response directly into `localTaskCache` (no second pull needed
   for that task — the response is already the authoritative new row).
   On success: remove the entry, and if it was a `create`, run the
   id-remap pass. On a network-shaped failure (request never
   completed): stop draining — leave this and all later entries queued
   for the next sync attempt. On a non-network failure (e.g. 404
   because the task was already deleted server-side by another session,
   or a validation error): drop just that entry and continue draining
   the rest — it cannot succeed by retrying unchanged.
4. **Reconcile the rest of the list** by merging the step-1 pull with
   `localTaskCache`: for every task id in the pull result that wasn't
   just handled by step 3, take the server's copy (this covers both
   "added elsewhere" and "edited elsewhere, no local conflict" cases).
   For every task id present in `localTaskCache` but missing from the
   pull result, remove it locally (deleted elsewhere) **unless** it's a
   still-queued local `create`'s temp id (that create hasn't synced
   yet — not a deletion) or a mutation for it is still queued after
   step 3 stopped early on a network failure (don't discard an
   unsynced local task just because a network hiccup mid-drain left the
   pull momentarily out of sync with it).
5. Write the reconciled list back to `localTaskCache`, notify
   `subscribeToTasks` listeners, and refresh the widget cache via the
   existing `writeWidgetCache`/`syncWidget` calls (unchanged from Phase
   2).

## Widget integration

`widget-task-handler.ts` already calls `toggleTaskComplete` from
`taskStorage.ts` for `WIDGET_CLICK`/`TOGGLE_TASK` — since that function
becomes queue-aware internally, the widget's toggle action is
offline-safe with no changes to its own logic. One addition: on
`WIDGET_ADDED`/`WIDGET_UPDATE`/`WIDGET_RESIZED`, the handler's existing
`getTasks().then(tasks => props.renderWidget(...))` call is replaced
with `syncEngine.syncNow().then(() => getTasks()).then(tasks =>
props.renderWidget(...))` — `syncNow()` drains any queue left behind by
a previous offline widget toggle first (updating `localTaskCache`), then
`getTasks()` reads the reconciled result to render. Both calls keep
their existing `.catch(() => {})` (the cached snapshot already rendered
first stays shown on failure, matching today's behavior).

## Logout blocking

`AuthContext.tsx`'s `logout()` checks `mutationQueue` (via
`syncEngine`'s pending count) before proceeding. If non-empty, `logout()`
rejects with a distinct `PendingSyncError` instead of calling
`logoutApi`/clearing tokens/calling `clearLocalTaskCache`. The caller
(wherever the logout button lives) catches this specific error and shows
"You have unsynced changes — connect to the internet first." This
applies only to the user-initiated logout path; the existing
session-expiry auto-logout (server-driven refresh-token revocation,
`986406f`) is a separate flow and is unaffected — a revoked session has
no way to sync anyway.

## UI changes

- `TaskRow` gains one new optional prop: `pending?: boolean`. When true,
  it renders a small dot/icon indicating the task has a queued,
  not-yet-confirmed change. This is `taskStorage.ts`-derived (does
  `mutationQueue` contain an entry for this task's id), not a stored
  field.
- `app/index.tsx`'s existing four `.catch(() => Alert.alert(...))`
  blocks (quick-add, save, delete, toggle) are unchanged. They become
  effectively dead code for the ordinary offline case (mutations now
  resolve instead of rejecting), but remain the correct safety net for
  genuine failures surfaced once a queued mutation finally drains and
  is rejected by the server.

## Testing

- Unit tests for `localTaskCache.ts` and `mutationQueue.ts`: pure
  AsyncStorage read/write/de-dup/id-remap logic, no network involved.
- `syncEngine.ts` tests with `api/tasks.ts` mocked at the fetch
  boundary (same pattern as Phase 2's auth tests): queue-drain
  success/partial-failure-and-stop ordering, the pull+diff reconciliation
  matrix (remote add / remote remove / same-task LWW-server-wins /
  same-task LWW-local-wins), and the create-then-remap path.
- `taskStorage.ts` tests: optimistic apply and listener notification
  happen synchronously before any network call resolves;
  `toggleTaskComplete`'s locally-computed rollover matches
  `recurrence.test.ts`'s existing assertions for the equivalent
  server-side case.
- `AuthContext` test: `logout()` rejects with `PendingSyncError` when
  the queue is non-empty, and proceeds normally when it's empty.
- Manual checklist: a new `docs/superpowers/manual-verification-phase3.md`
  covering airplane-mode create/edit/toggle/delete, reconnect and
  confirm sync completes and the pending indicator clears, forcing a
  same-task conflict from two logged-in sessions and confirming
  last-write-wins, and the widget-offline-toggle-then-reopen-app path.
