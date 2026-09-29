# Todo App Phase 2 — Expo Migration + Shared Web/Mobile UI

Status: Approved for planning
Date: 2026-09-29

## Context

Phase 1 (see [2026-09-28-todo-backend-phase1-design.md](2026-09-28-todo-backend-phase1-design.md)
and its implementation plan) built a standalone Node/TypeScript backend —
email/password auth (register, verify, login, refresh, logout,
forgot/reset password) and a per-user task CRUD API — with no frontend
changes. It is merged to `main` and working.

The frontend today ("Loop") is a bare React Native 0.74.5 app: a single
`App.tsx` screen with task list/filter/search UI, backed entirely by local
`AsyncStorage` (`src/storage/taskStorage.ts`), plus a native Android
home-screen widget (`react-native-android-widget`, a hand-written Kotlin
`TodoWidget` class, and matching manifest/XML resources under `android/`).
There is no web build and no user accounts.

Phase 2 is: migrate to Expo, add a real web build sharing the same UI
components as mobile (via Expo's built-in React Native Web / Metro web
support), and wire the app up to the Phase 1 backend — **online-first**,
calling the API directly. Phase 3 (a later spec) adds an offline-first
local cache and background sync engine on top of this; that is explicitly
not part of Phase 2.

### A note on scope discovery

While finishing Phase 1, a large amount of pre-existing, uncommitted
mobile UI work on `main` (the current `App.tsx`, `TaskRow`,
`TaskEditorModal`, the Android widget files, `src/theme.ts`,
`src/utils/selectors.ts`) turned out to already exist in the working tree
and was committed by the user (`5a0ba2f`) independently of this session.
It predates and is unrelated to Phase 2's scope — it's the mobile app UI
Phase 2 builds on, not itself part of the Expo/web migration. This spec
takes that commit as its starting point.

## Goals

- The app runs as an Expo project, buildable for Android, iOS, and web
  from one codebase, using Expo Router for navigation.
- A user can register, verify their email, log in, log out, and reset a
  forgotten password, from either the native app or the web app, talking
  to the Phase 1 backend.
- The existing task list UI (today/upcoming/all/completed filters, quick
  add, search, task editor modal, recurrence) works unchanged in behavior,
  now reading/writing through the backend API instead of `AsyncStorage`.
- The Android home-screen widget keeps working: it displays the latest
  known tasks (from a small local cache refreshed whenever the app
  successfully talks to the backend) and can still toggle a task's
  completion via a direct, best-effort API call.
- `TaskRow`, `TaskEditorModal`, `LogoMark`, `src/theme.ts`, and the
  recurrence/selector utilities require **no changes** — only their data
  source changes, not their interfaces.

## Non-goals (explicitly out of scope for Phase 2)

- Offline cache, background sync, or a sync queue (Phase 3).
- Active iOS development/testing (the config plugin/prebuild setup
  supports building for iOS, but no iOS-specific screens or testing work
  happens this phase).
- A custom Expo config plugin for the widget — `android/` is prebuilt once
  and then hand-maintained going forward (see "Native Android / widget
  strategy" below), not regenerated from a plugin on every prebuild.
- Choosing and configuring a web hosting provider (Vercel/Netlify/etc.) —
  the build stays host-agnostic; deployment is a later decision.
- Any Google integration (already dropped in Phase 1; stays dropped).

## Migration to Expo

- Install Expo SDK (latest stable compatible with React Native 0.74.x;
  the implementer resolves the exact compatible SDK version — this spec
  intentionally does not pin one) alongside the existing `react-native`
  dependency, following Expo's official "install into an existing bare RN
  project" path (`npx install-expo-modules`, then adding `expo` itself).
- Add `react-native-web` and `react-dom` so `expo start --web` /
  `expo export --platform web` work; Expo's default web bundler (Metro,
  on current SDKs) needs no hand-written webpack config.
- Replace `index.js`'s current entry-point wiring with Expo Router's
  entry (`"main": "expo-router/entry"` in `package.json`), and add
  `expo-router` plus its peer deps (`expo-linking`, `expo-constants`,
  `react-native-safe-area-context`, `react-native-screens`).
- Run `npx expo prebuild --platform android` (and `--platform ios`) once
  to fold Expo's native requirements into the existing `android/` (which
  stays exactly as hand-edited today, including the widget files —
  prebuild only adds what Expo modules require, e.g. a small edit to
  `MainApplication.kt` to register Expo's module registry) and to
  (re-)generate `ios/` fresh (it was deleted earlier; Expo needs it
  present to build for iOS even though iOS isn't actively developed this
  phase). Both `android/` and `ios/` stay committed to git — Phase 2
  deliberately opts out of Expo's usual "gitignore the native folders,
  regenerate them from config" convenience, per the native-code decision
  below.
- `app.json` becomes the Expo config: `name`/`slug`, `scheme` (needed for
  auth deep links to resolve correctly on native), and a `web` block
  (`bundler: "metro"`).

## Native Android / widget strategy

The widget's Kotlin class (`TodoWidget.kt`, a two-line subclass of
`RNWidgetProvider`), its manifest `<receiver>` entry, and its XML
layout/drawable resources are **not** touched by this migration. They
keep being hand-edited directly in `android/`, exactly as today. This
trades away Expo's "regenerate native folders from a config plugin"
model (an SDK upgrade later means manually merging `android/` changes
instead of re-running `expo prebuild` cleanly) for avoiding real
short-term engineering cost: writing a correct Expo config plugin that
programmatically injects a Kotlin `AppWidgetProvider`, its manifest
receiver, and XML resources is nontrivial, and the widget already works
today without one.

## Project structure

```
app/                          # Expo Router routes
  _layout.tsx                 # AuthProvider, auth-gated redirects, root stack
  index.tsx                   # task list — ported from current App.tsx
  login.tsx
  register.tsx
  verify-email.tsx            # reads ?token= from the URL
  forgot-password.tsx
  reset-password.tsx          # reads ?token= from the URL

src/
  api/
    client.ts                 # fetch wrapper: Bearer header, one 401-refresh-retry
    auth.ts                   # register/login/refresh/logout/forgot/reset calls
    tasks.ts                  # task CRUD calls
  auth/
    AuthContext.tsx           # current user + tokens; login/register/logout
    tokenStorage.ts           # SecureStore (native) / localStorage (web), one interface
  components/                 # LogoMark, TaskEditorModal, TaskRow — unchanged
  storage/
    taskStorage.ts            # same public API, now backed by src/api/tasks.ts
    widgetCache.ts            # small AsyncStorage snapshot for the widget (new)
  theme.ts, types/, utils/    # unchanged
  widgets/                    # unchanged public interfaces; internals read the new cache
```

`App.tsx` and the current `index.js` are removed; `App.tsx`'s JSX becomes
`app/index.tsx` with no behavioral changes beyond swapping its data
source.

## Auth

`src/auth/AuthContext.tsx` holds `{ user, accessToken, refreshToken,
status: 'loading' | 'authed' | 'anonymous' }` and exposes
`login(email, password)`, `register(email, password)`, `logout()`. On
startup it reads persisted tokens via `tokenStorage` (native:
`expo-secure-store`; web: `localStorage`, behind the same interface —
this mirrors Phase 1's own choice of bearer tokens over cookies, made
specifically to avoid cross-platform cookie/CORS complexity) and, if
present, treats the user as authenticated while a background call
confirms the session is still valid.

`src/api/client.ts` centralizes every authenticated request: it attaches
`Authorization: Bearer <accessToken>`, and on a `401` response performs
exactly one `POST /auth/refresh` + retry of the original request before
giving up and calling `logout()`. The backend's base URL comes from
`process.env.EXPO_PUBLIC_API_URL` (Expo's standard public-env-var
convention — available identically on native and web builds without
extra plumbing).

`app/_layout.tsx` redirects: an unauthenticated user hitting `/` (or any
route other than `login`/`register`/`verify-email`/`forgot-password`/
`reset-password`) is sent to `/login`; an authenticated user hitting
`login`/`register` is sent to `/`. `verify-email` and `reset-password`
are reachable regardless of auth state, since their whole purpose is
consuming a token from an email link.

### Screens

- **`login.tsx`** — email + password, submit → `POST /auth/login`. A
  `403 EMAIL_NOT_VERIFIED` response shows an inline "resend verification
  email" action (`POST /auth/resend-verification`) instead of a generic
  error. Links to `register` and `forgot-password`.
- **`register.tsx`** — email + password (+ confirm-password, a
  client-side-only check), submit → `POST /auth/register`, then shows the
  same generic "check your inbox" message the backend returns regardless
  of whether the email was new or already registered (matching the
  backend's deliberate non-enumeration behavior — the UI must not imply
  otherwise).
- **`verify-email.tsx`** — reads `token` from the route's query params,
  calls `POST /auth/verify-email` automatically on mount, shows
  success/failure, and links to `login` either way.
- **`forgot-password.tsx`** — email field, submit → `POST
  /auth/forgot-password`, shows the backend's generic response.
- **`reset-password.tsx`** — reads `token` from the route's query params,
  a new-password field, submit → `POST /auth/reset-password`, then
  redirects to `login` on success with a brief confirmation.

## Task data layer

`src/storage/taskStorage.ts` keeps its exact current exported surface —
`getTasks()`, `addTask(input)`, `updateTask(id, changes)`,
`deleteTask(id)`, `toggleTaskComplete(id)`, `subscribeToTasks(listener)` —
so `TaskRow`, `TaskEditorModal`, and `app/index.tsx` (the ported
`App.tsx`) need no changes beyond their import paths staying the same.
Internally, each function now calls the matching `src/api/tasks.ts`
function (`GET/POST /tasks`, `PATCH/DELETE /tasks/:id`, `POST
/tasks/:id/toggle`) instead of reading/writing `AsyncStorage`, and the
existing subscribe/notify pub-sub mechanism stays exactly as it is today
— it just gets triggered by API responses instead of local writes.

After every successful `getTasks()` (i.e., whenever the app has fetched a
fresh list from the backend), `taskStorage.ts` also writes that list to
`src/storage/widgetCache.ts` (a thin `AsyncStorage` wrapper) — this is
the only local persistence Phase 2 adds, and it exists solely to back the
widget described below.

## Widget bridging

`widget-task-handler.ts`'s public shape is unchanged: it still calls
`getTasks()`/`toggleTaskComplete()` from `taskStorage.ts`. Since a
headless widget-click context making a live network call is best-effort
(no guaranteed connectivity, no retry UI), the strategy is:

- **Display** (`WIDGET_ADDED`/`WIDGET_UPDATE`/`WIDGET_RESIZED`): read from
  `widgetCache.ts`'s last-synced snapshot first (instant, works offline),
  and if that read succeeds, render immediately; a live `getTasks()` call
  is attempted in the background and re-renders the widget if it
  succeeds, but its failure is silent (the cached snapshot stays shown).
- **Toggle** (`WIDGET_CLICK` / `TOGGLE_TASK`): calls the real
  `toggleTaskComplete(taskId)` (a live API call) and re-renders from
  whatever `getTasks()` returns afterward; if the API call fails (no
  connectivity, expired session that can't silently refresh, etc.), the
  widget's next display re-render will show the un-toggled state from the
  cache and the failure is silent — there is no offline queue or retry
  logic in Phase 2. This matches the phase's overall online-first scope;
  a real offline-safe widget experience is part of Phase 3's job.

## Testing

- Jest + `@testing-library/react-native` for screen-level tests: form
  validation on each auth screen, `verify-email`/`reset-password`'s
  token-from-URL handling, the `401`-triggers-one-refresh-then-logout
  behavior in `src/api/client.ts`. `src/api/*` is mocked at the `fetch`
  boundary for these — no real backend needed to run the frontend test
  suite.
- `taskStorage.ts`'s existing behavior (filtering/selectors, recurrence
  interplay) is already covered by `__tests__/recurrence.test.ts` and
  `__tests__/selectors.test.ts`, which are pure-logic tests unaffected by
  swapping the storage backend — they keep passing unchanged.
- A short, documented manual checklist (register → verify → log in →
  create/toggle/edit a task → log out → forgot/reset password → log back
  in) is run by hand against the real Phase 1 backend, on both a native
  build and `expo start --web`, before considering Phase 2 done — this
  spec does not attempt full E2E browser/device automation.

## Open items for Phase 3 (not decided here)

- Offline cache design: what gets cached, conflict resolution, sync queue
  shape.
- Whether the widget's toggle action gets a real offline queue once Phase
  3's sync engine exists.
