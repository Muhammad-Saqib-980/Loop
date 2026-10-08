# Todo backend (Phase 1)

Email/password auth + task CRUD API. See
`docs/superpowers/specs/2026-09-28-todo-backend-phase1-design.md` at the
repo root for the full design.

## Local development

1. Copy `.env.example` to `.env` and fill in real values (a random 32+
   character string for `JWT_SECRET`, a Resend API key for
   `RESEND_API_KEY`). See [Email configuration](#email-configuration) to run
   without an email provider.
2. `docker compose up -d` — starts Postgres with both a `todo_dev` and a
   `todo_test` database.
3. `npm install`
4. `npm run migrate` — applies database migrations to `DATABASE_URL`.
5. `npm run dev` — starts the API on `PORT` (default 4000).

## Email configuration

| `RESEND_API_KEY` + `EMAIL_FROM` | `REQUIRE_EMAIL_VERIFICATION` | Behaviour |
| --- | --- | --- |
| set | `true` (default) | New accounts must click the emailed link before logging in. |
| set | `false` | Accounts can log in immediately; password-reset emails still work. |
| empty | `false` | No emails are sent. Accounts log in immediately; `/auth/forgot-password` and `/auth/resend-verification` return `503 {"code":"EMAIL_DISABLED"}` and the app tells the user email isn't available. |
| empty | `true` | Invalid — the server refuses to start. |

`GET /auth/config` exposes `{ emailVerificationRequired, emailEnabled }` so
the app can adjust its wording. Turning verification off also lets existing
unverified accounts log in.

## Running the API in Docker

`docker compose --profile app up --build` builds the image and starts the API
on port 4000 alongside Postgres (stop `npm run dev` first; both use 4000). It
reads secrets from `.env`, points `DATABASE_URL` at the compose `postgres`
service, and applies pending migrations on every start.

Running the image on its own needs the env passed in, with a database
reachable from inside the container:

```bash
docker run --env-file .env -e DATABASE_URL=postgres://todo:todo@host.docker.internal:5432/todo_dev -p 4000:4000 <image>
```

## Tests

`npm test` runs unit and integration tests. Integration tests need Postgres
reachable at the `DATABASE_URL` used in tests (see `test/setupEnv.ts`;
defaults to the `todo_test` database created by `docker compose up`).
Each integration test file applies pending migrations itself, so a separate
`npm run migrate` isn't required before testing.

See `docs/manual-testing.http` for example requests once the server is
running.
