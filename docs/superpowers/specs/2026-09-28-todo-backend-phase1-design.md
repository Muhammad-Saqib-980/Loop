# Todo App Backend — Phase 1: Auth + Task API

Status: Approved for planning
Date: 2026-09-28

## Context

The Todo app ("Loop") is currently a bare React Native app with no backend —
tasks live only in `AsyncStorage` on-device (`src/storage/taskStorage.ts`).
The goal is to turn this into a public, multi-device product with real user
accounts and a server-side task store.

This is Phase 1 of a three-phase project:

- **Phase 1 (this spec):** standalone backend — accounts, auth, task CRUD API.
  No frontend changes.
- **Phase 2 (future spec):** migrate the frontend to Expo, add a web build via
  React Native Web sharing the same UI components as mobile, and wire it up
  to this backend (online-first, no offline cache yet).
- **Phase 3 (future spec):** offline-first local cache + background sync
  engine layered on top of Phase 2.

### Decisions carried over from brainstorming

The request originally asked for Google-only sign-in with Google Calendar
sync. Over the course of design discussion this was deliberately dropped:
first Calendar sync was replaced with a Drive-based backup idea, then Google
was dropped entirely in favor of plain email/password auth. **Google
integration is fully out of scope, not deferred** — there is no requirement
to keep the door open for adding it later.

Phase 1 targets a **public product**, which is why it includes email
verification, password reset, and rate limiting rather than a bare-minimum
login.

## Goals

- Users can register, verify their email, log in, and reset a forgotten
  password, using email + password only.
- Authenticated users can create, read, update, delete, and toggle-complete
  tasks, with data isolated per user in Postgres.
- The task data model and toggle-complete semantics (including recurrence
  rollover) match the existing `src/types/task.ts` /
  `src/storage/taskStorage.ts` behavior exactly, so Phase 2 can swap local
  storage calls for API calls with minimal logic changes.
- Reasonable security baseline for a public-facing service: hashed
  passwords, hashed/rotated tokens, rate-limited auth endpoints, no user
  enumeration via error messages.

## Non-goals (explicitly out of scope for Phase 1)

- Any UI/frontend work, Expo migration, or web build.
- Google sign-in, Google Calendar sync, Google Drive backup — dropped
  entirely per the pivot above.
- Offline support, background sync, conflict resolution.
- Push notifications.
- Horizontal scaling concerns beyond a single backend instance (noted as a
  future improvement where relevant, not built now).

## Architecture

New top-level `backend/` directory alongside the existing RN app, sharing
the repo but otherwise independent (no build-time coupling to the RN app in
this phase):

```
backend/
  src/
    server.ts                # Express app entrypoint
    env.ts                   # typed env var loading/validation
    auth/
      password.ts            # bcrypt hash/verify
      tokens.ts              # JWT access token issuance/verification,
                              # opaque refresh token generation/hashing
      middleware.ts           # requireAuth middleware (verifies Bearer JWT)
    routes/
      auth.ts                # /auth/* endpoints
      tasks.ts               # /tasks/* endpoints
    db/
      migrations/            # node-pg-migrate migration files
      client.ts               # pg Pool
      users.ts                # user queries
      tasks.ts                # task queries
      tokens.ts                # verification/reset/refresh token queries
    email/
      sender.ts               # EmailSender interface
      resendSender.ts          # Resend implementation
      templates.ts             # verification/reset email content
    services/
      recurrence.ts             # ported from src/utils/recurrence.ts
      taskService.ts             # create/update/delete/toggle, mirrors
                                  # taskStorage.ts semantics
    middleware/
      rateLimit.ts                # per-IP limiters for auth endpoints
  test/
    integration/                  # supertest-based API flow tests
    unit/
  Dockerfile
  docker-compose.yml               # local Postgres for dev
  .env.example
  package.json
  tsconfig.json
```

Runtime: Node 20+, Express, Postgres (any Postgres 14+; local dev via Docker
Compose, production via whatever managed Postgres you provision —
deployment target is left platform-agnostic; the `Dockerfile` runs anywhere
that accepts a container, e.g. Render/Fly.io/Railway).

## Data model

All tables use UUID primary keys (`gen_random_uuid()`).

### `users`

| column          | type        | notes                              |
|-----------------|-------------|-------------------------------------|
| id              | uuid PK     |                                      |
| email           | text unique | lowercased before storage           |
| password_hash   | text        | bcrypt, cost 12                     |
| email_verified  | boolean     | default false                       |
| created_at      | timestamptz | default now()                       |
| updated_at      | timestamptz | default now()                       |

### `email_verification_tokens` / `password_reset_tokens`

Same shape for both:

| column      | type        | notes                                    |
|-------------|-------------|-------------------------------------------|
| id          | uuid PK     |                                            |
| user_id     | uuid FK     | references users(id) on delete cascade    |
| token_hash  | text        | sha256 of the token sent by email         |
| expires_at  | timestamptz | 24h (verification) / 1h (reset)           |
| used_at     | timestamptz | null until consumed; consumed tokens are  |
|             |             | rejected on reuse                          |
| created_at  | timestamptz | default now()                             |

The raw token is only ever held in memory long enough to email it; only its
hash is persisted, mirroring how refresh tokens are handled.

### `refresh_tokens`

| column      | type        | notes                                        |
|-------------|-------------|------------------------------------------------|
| id          | uuid PK     |                                                  |
| user_id     | uuid FK     |                                                  |
| token_hash  | text        | sha256 of the opaque refresh token               |
| expires_at  | timestamptz | now() + 30 days                                  |
| revoked_at  | timestamptz | null while active                                |
| replaced_by | uuid null   | id of the token that replaced it on rotation     |
| created_at  | timestamptz | default now()                                    |

### `tasks`

Direct port of `src/types/task.ts`:

| column      | type        | notes                                     |
|-------------|-------------|---------------------------------------------|
| id          | uuid PK     |                                               |
| user_id     | uuid FK     | references users(id) on delete cascade       |
| title       | text        |                                               |
| notes       | text null   |                                               |
| priority    | text        | 'low' \| 'medium' \| 'high'                  |
| due_date    | date null   |                                               |
| completed   | boolean     | default false                                |
| recurrence  | jsonb null  | `{type, interval, daysOfWeek?, endDate?}`    |
| history     | jsonb       | array of ISO date strings, default `[]`      |
| created_at  | timestamptz | default now()                                |
| updated_at  | timestamptz | default now()                                |

Index on `tasks(user_id)`.

## Auth flows

All auth endpoints are under `/auth`. All responses are JSON.

- **`POST /auth/register`** `{email, password}` → creates a `users` row with
  `email_verified = false`, generates a verification token, emails a link
  containing it (`{APP_BASE_URL}/verify-email?token=...`), returns `201`
  with no tokens (you must verify before you can log in). Password minimum
  length 8, validated with zod. Duplicate email returns a generic "check
  your email" style response rather than confirming the email is taken
  (avoids enumeration) — but see Security section for the practical
  trade-off here.

- **`POST /auth/verify-email`** `{token}` → looks up by hash, checks not
  expired/used, sets `email_verified = true`, marks token used.

- **`POST /auth/resend-verification`** `{email}` → issues a new token if the
  account exists and isn't already verified; always returns `200`.

- **`POST /auth/login`** `{email, password}` → verifies password; if
  `email_verified` is false, returns `403` with a distinct error code
  (`EMAIL_NOT_VERIFIED`) so the client can offer "resend verification"; on
  success issues an access token (JWT, 15 min) and a refresh token (opaque
  random 32 bytes, returned to the client, hash stored in DB).

- **`POST /auth/refresh`** `{refreshToken}` → hashes the provided token,
  looks it up, checks not expired/revoked; issues a new access+refresh pair,
  marks the old refresh token row `revoked_at` + `replaced_by`. If a
  **revoked** token is presented (reuse of an already-rotated token), treat
  it as compromise: revoke all refresh tokens for that user and return
  `401`.

- **`POST /auth/logout`** `{refreshToken}` → revokes that refresh token.

- **`POST /auth/forgot-password`** `{email}` → always returns `200`
  regardless of whether the account exists; if it does, generates a reset
  token and emails a link.

- **`POST /auth/reset-password`** `{token, newPassword}` → validates token,
  updates `password_hash`, marks token used, and revokes **all** existing
  refresh tokens for that user (force re-login on every device).

JWT access tokens are signed HS256 with a secret from the environment,
containing `{sub: userId}` and standard `iat`/`exp`. They are stateless
(not stored server-side); only refresh tokens are persisted, which is what
makes revocation possible.

## Task API

All endpoints under `/tasks`, require `Authorization: Bearer <accessToken>`
(enforced by `requireAuth` middleware, which verifies the JWT and attaches
`req.userId`). All queries scoped to `user_id = req.userId` — no task is
ever readable/writable across accounts.

- **`GET /tasks`** → list all tasks for the user.
- **`POST /tasks`** `{title, notes?, priority, dueDate?, recurrence?}` →
  creates a task (`completed: false`, `history: []`), matching
  `addTask` in `taskStorage.ts`.
- **`PATCH /tasks/:id`** `{...partial NewTaskInput}` → updates fields,
  trims title like `updateTask` does.
- **`DELETE /tasks/:id`** → deletes the task.
- **`POST /tasks/:id/toggle`** → reproduces `toggleTaskComplete`'s exact
  behavior:
  - Non-recurring: flips `completed`.
  - Recurring, not yet done today: appends today to `history`, computes the
    next due date via the ported `computeNextDueDate`, sets `completed` to
    `true` only if there is no next occurrence.
  - Recurring, already done today: removes today from `history` (undo).

`computeNextDueDate` and `todayISODate` are ported verbatim from
`src/utils/recurrence.ts` into `backend/src/services/recurrence.ts` so
behavior is guaranteed identical; the existing frontend copy is left alone
in this phase (Phase 2 will remove the duplication when the frontend starts
calling the API instead of local storage).

## Security

- Passwords hashed with bcrypt, cost factor 12.
- All tokens (email verification, password reset, refresh) stored only as
  sha256 hashes; raw values exist only transiently (email body / API
  response).
- Refresh token rotation with reuse detection (see above).
- Rate limiting (in-memory, per-IP, via `express-rate-limit`) on
  `/auth/register`, `/auth/login`, `/auth/forgot-password`,
  `/auth/resend-verification`. Noted limitation: in-memory state means
  limits reset on restart and don't share across instances — fine for a
  single instance, flagged as needing a Redis-backed store if the backend
  is ever scaled horizontally.
- Generic, non-enumerating responses on register/login/forgot-password
  where practical. (Full non-enumeration on `/register` is a genuine
  trade-off against giving users clear signup errors — this spec chooses to
  return a generic "if this email can be registered, check your inbox"
  response on `/register` too, accepting the minor UX cost for the security
  benefit, consistent with `/forgot-password`.)
- Input validation via zod on every endpoint body.
- Standard hardening middleware: `helmet`, CORS restricted to configured
  frontend origin(s) via `APP_BASE_URL`/an allowlist env var.
- Secrets (`JWT_SECRET`, DB credentials, email API key) only via environment
  variables, never committed; `.env.example` documents required vars with
  placeholder values.

## Email delivery

`EmailSender` interface:

```ts
interface EmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}
```

Implemented against Resend (API-key based) for this phase; swappable later
since routes/services only depend on the interface. Verification and reset
emails link to `${APP_BASE_URL}/verify-email?token=...` and
`${APP_BASE_URL}/reset-password?token=...` respectively — these routes
don't exist yet (no frontend in Phase 1), so `APP_BASE_URL` will point
nowhere real until Phase 2. Phase 1 verifies these flows via integration
tests and a documented curl/HTTP script (`backend/docs/manual-testing.http`
or similar), not by clicking real emails end-to-end.

## Testing strategy

- **Unit tests:** password hashing/verification, JWT sign/verify, opaque
  token generation/hashing, and the ported recurrence logic
  (`computeNextDueDate`) against the same cases already covered in
  `__tests__/recurrence.test.ts`.
- **Integration tests:** supertest against the Express app with a real test
  Postgres database (via Docker Compose or testcontainers), covering:
  register → verify → login → CRUD tasks → toggle recurring task → refresh
  → logout → forgot-password → reset-password → old sessions revoked.
- Migrations run against the test DB before the integration suite.

## Dev / deployment

- **Local dev:** `docker-compose.yml` brings up Postgres; `npm run migrate`
  applies `node-pg-migrate` migrations; `npm run dev` starts the API with
  hot reload.
- **`.env.example`** documents: `DATABASE_URL`, `JWT_SECRET`,
  `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `RESEND_API_KEY`,
  `EMAIL_FROM`, `APP_BASE_URL`, `CORS_ORIGINS`, `PORT`.
- **Deployment target:** deliberately platform-agnostic — a `Dockerfile`
  that runs the built app, deployable to Render/Fly.io/Railway/etc. Actual
  provisioning (managed Postgres, chosen host) is a decision for whenever
  you're ready to deploy, not baked into this spec.

## Open items for Phase 2 (not decided here)

- How the frontend obtains/stores tokens (e.g. `SecureStore` on mobile,
  memory/httpOnly-adjacent handling on web) — to be designed in the Phase 2
  spec once the Expo migration shape is settled.
- Whether `/auth/register`'s generic response is revisited once there's a
  real signup UI to design around it.
