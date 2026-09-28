# Todo backend (Phase 1)

Email/password auth + task CRUD API. See
`docs/superpowers/specs/2026-09-28-todo-backend-phase1-design.md` at the
repo root for the full design.

## Local development

1. Copy `.env.example` to `.env` and fill in real values (a random 32+
   character string for `JWT_SECRET`, a Resend API key for
   `RESEND_API_KEY`).
2. `docker compose up -d` — starts Postgres with both a `todo_dev` and a
   `todo_test` database.
3. `npm install`
4. `npm run migrate` — applies database migrations to `DATABASE_URL`.
5. `npm run dev` — starts the API on `PORT` (default 4000).

## Tests

`npm test` runs unit and integration tests. Integration tests need Postgres
reachable at the `DATABASE_URL` used in tests (see `test/setupEnv.ts`;
defaults to the `todo_test` database created by `docker compose up`).
Each integration test file applies pending migrations itself, so a separate
`npm run migrate` isn't required before testing.

See `docs/manual-testing.http` for example requests once the server is
running.
