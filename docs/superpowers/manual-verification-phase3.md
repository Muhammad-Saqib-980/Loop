# Phase 3 manual verification checklist

Run this against the real Phase 1 backend, on a native build
(`npx expo run:android`) with airplane mode available. Complete
`manual-verification-phase2.md` first if you haven't already — this
extends it with offline-specific checks.

1. Turn on airplane mode. Create a task, edit another task's title, toggle
   a third task complete, and delete a fourth. Confirm all four changes
   apply immediately in the UI (no "check your connection" alert) and each
   changed row shows the pending indicator.
2. Turn off airplane mode and bring the app to the foreground (or wait for
   it to already be foregrounded). Confirm the pending indicators clear
   within a few seconds and the changes are still present.
3. Kill and reopen the app. Confirm the four changes from step 1 are still
   there, sourced from the server this time (open the backend's task list
   directly, e.g. via `psql` or an API call, to confirm they actually
   persisted).
4. Try to log out while airplane mode is on and a change is still pending
   (repeat step 1's create, then immediately try "Log out" before it
   syncs). Confirm you see "You have unsynced changes — connect to the
   internet first" and remain logged in. Turn off airplane mode, wait for
   the pending indicator to clear, then log out successfully.
5. Force a same-task conflict: log in as the same account on two sessions
   (e.g. the native app and `expo start --web`). Turn off connectivity on
   one, edit a task's title there, then edit the *same* task's title
   differently on the still-online session and let it sync. Reconnect the
   offline session. Confirm the online session's edit wins (last-write-
   wins) and the offline session's stale edit is silently dropped, not
   applied on top.
6. On Android: turn on airplane mode, tap a task in the home-screen widget
   to toggle it. Confirm the widget's own display updates optimistically.
   Reopen the app (still offline) and confirm the same task shows toggled
   there too, with a pending indicator. Turn off airplane mode, reopen the
   widget (trigger a `WIDGET_UPDATE`, e.g. by resizing it slightly or
   waiting for its periodic update), and confirm the pending indicator
   clears once the app is reopened.
7. Turn on airplane mode, create a task, and kill the app before
   reconnecting. Turn off airplane mode and cold-start the app (startup
   fires several syncs at once). Confirm the task appears exactly once,
   both in the app and in the backend's task list — not duplicated.

## Known limitation: widget/app cross-process concurrency

The sync engine's locking (`src/sync/lock.ts`, `syncEngine.ts`'s `epoch`/
`inFlight`/`idAliases`) only serializes `syncNow()` calls within a single JS
runtime. On Android, the home-screen widget's headless task can run in a
*separate* JS process from the main app. If the widget and the main app both
trigger a sync at nearly the same moment (app just backgrounded but not
killed, widget resize/periodic update fires), each process has its own
lock/epoch state and both could drain the same queued mutation, risking a
duplicate create on the server. This is believed low-risk (the headless task
typically only runs when the app process is dead) but is untested — step 6
above only exercises the widget and app sequentially, never concurrently. A
real fix would need a cross-process guard, e.g. an AsyncStorage-based
"mutation in flight" marker checked/set atomically. Tracked as a fast-follow,
not a Phase 3 blocker.
