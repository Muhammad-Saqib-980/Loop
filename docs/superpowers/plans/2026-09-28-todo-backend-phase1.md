# Todo Backend Phase 1 (Auth + Task API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Node/TypeScript backend (`backend/`) providing email/password authentication and a per-user task CRUD API, with no frontend changes and no Google integration.

**Architecture:** Express + Postgres, layered as DB query modules → services → HTTP routes. Auth uses backend-issued JWT access tokens (stateless, 15 min) plus opaque, hashed, rotated refresh tokens (30 days) stored in Postgres. All task queries are scoped by `user_id`.

**Tech Stack:** Node 20+, TypeScript, Express, `pg` (node-postgres), bcryptjs, jsonwebtoken, zod, express-rate-limit, helmet, cors, Jest + ts-jest + supertest.

**Spec:** [docs/superpowers/specs/2026-09-28-todo-backend-phase1-design.md](../specs/2026-09-28-todo-backend-phase1-design.md)

## Global Constraints

- Node.js 20+, Postgres 14+ (migrations enable `pgcrypto` for `gen_random_uuid()`).
- Passwords hashed with bcrypt, cost/salt-rounds 12 (via `bcryptjs`, no native build step).
- Access tokens: JWT, HS256, 15 minute TTL, stateless (not persisted).
- Refresh tokens: opaque 32-byte random values, 30 day TTL, stored only as sha256 hashes, rotated on every use.
- Email verification tokens: 24h TTL. Password reset tokens: 1h TTL. Both stored only as sha256 hashes, single-use.
- Rate limiting applied to `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/resend-verification`.
- All request bodies validated with zod; minimum password length is 8 characters.
- Every `tasks` query is scoped to the authenticated `user_id` — no cross-user reads or writes.
- CORS restricted via the `CORS_ORIGINS` env var; `helmet` applied to every response.
- Secrets only via environment variables (`backend/.env`, never committed); `.env.example` documents every required variable.

## Review Focus

- Registering twice with the same email must not create a second account, must not let the second attempt overwrite the first account's password, and must return the same response either way (no account-existence leak). → Task 10.
- Presenting an already-rotated (revoked) refresh token must revoke **every** refresh token for that user, not just deny the one request. → Task 11.
- A wrong password and an unknown email on `/auth/login` must produce identical status codes and bodies. → Task 11.
- A user must not be able to read, update, or delete another user's task by id — the API responds `404`, never `403` or the task's data, so existence isn't confirmed either. → Task 14.
- An expired (but otherwise correctly-hashed) email-verification or password-reset token must be rejected, not treated as valid. → Tasks 10 and 12.

---

## Task 1: Backend project scaffold + health check

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/jest.config.js`
- Create: `backend/.env.example`
- Create: `backend/docker-compose.yml`
- Create: `backend/docker/init-test-db.sql`
- Create: `backend/Dockerfile`
- Create: `backend/README.md`
- Create: `backend/src/env.ts`
- Create: `backend/test/setupEnv.ts`
- Create: `backend/src/server.ts`
- Test: `backend/test/integration/health.test.ts`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: `env` (typed, validated config object) from `backend/src/env.ts`, consumed by every later task.
- Produces: `createServer(): express.Express` from `backend/src/server.ts`, extended in Task 15.

- [ ] **Step 1: Create the project scaffold files**

`backend/package.json`:

```json
{
  "name": "todo-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "migrate": "tsx src/db/migrateCli.ts",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.0",
    "@types/pg": "^8.11.6",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0"
  }
}
```

`backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src"]
}
```

`backend/jest.config.js`:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setupEnv.ts'],
  testMatch: ['**/test/**/*.test.ts'],
};
```

`backend/.env.example`:

```
DATABASE_URL=postgres://todo:todo@localhost:5432/todo_dev
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
RESEND_API_KEY=replace-with-your-resend-api-key
EMAIL_FROM=Loop <noreply@example.com>
APP_BASE_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
PORT=4000
NODE_ENV=development
```

`backend/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: todo
      POSTGRES_PASSWORD: todo
      POSTGRES_DB: todo_dev
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql
volumes:
  pgdata:
```

`backend/docker/init-test-db.sql`:

```sql
CREATE DATABASE todo_test;
```

`backend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

`backend/README.md`:

```markdown
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
```

Modify `.gitignore` at the repo root, adding at the end:

```
# Backend
/backend/.env
/backend/.env.test
/backend/dist
```

- [ ] **Step 2: Install backend dependencies**

Run:

```bash
cd backend && npm install
```

- [ ] **Step 3: Create the env loader**

`backend/src/env.ts`:

```ts
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  APP_BASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default(''),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),
});

export const env = schema.parse(process.env);
```

- [ ] **Step 4: Create the test environment setup**

`backend/test/setupEnv.ts`:

```ts
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://todo:todo@localhost:5432/todo_test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.EMAIL_FROM = 'Loop <test@example.com>';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.PORT = '4000';
process.env.NODE_ENV = 'test';
```

- [ ] **Step 5: Write the failing test for the health endpoint**

`backend/test/integration/health.test.ts`:

```ts
import request from 'supertest';
import { createServer } from '../../src/server';

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createServer();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd backend && npm test -- test/integration/health.test.ts`
Expected: FAIL — `Cannot find module '../../src/server'`.

- [ ] **Step 7: Implement the server**

`backend/src/server.ts`:

```ts
import express from 'express';
import { env } from './env';

export function createServer() {
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}

if (require.main === module) {
  const app = createServer();
  app.listen(env.PORT, () => {
    console.log(`Backend listening on port ${env.PORT}`);
  });
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd backend && npm test -- test/integration/health.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend .gitignore
git commit -m "Scaffold backend project with health check endpoint"
```

---

## Task 2: Database schema, migration runner, and DB client

**Files:**
- Create: `backend/src/db/client.ts`
- Create: `backend/src/db/migrations/001_init.sql`
- Create: `backend/src/db/migrate.ts`
- Create: `backend/src/db/migrateCli.ts`
- Create: `backend/test/testDb.ts`
- Test: `backend/test/integration/migrate.test.ts`

**Interfaces:**
- Consumes: `env.DATABASE_URL` from Task 1.
- Produces: `pool` (a `pg.Pool`) from `backend/src/db/client.ts`, used by every DB-touching module from here on.
- Produces: `runMigrations(pool: Pool): Promise<string[]>` from `backend/src/db/migrate.ts`, used by every integration test's `beforeAll`.
- Produces: `truncateAll(): Promise<void>` from `backend/test/testDb.ts`, used by every integration test's `afterEach`.

- [ ] **Step 1: Start Postgres**

Run: `cd backend && docker compose up -d`

This container must stay running for the rest of this plan's integration tests.

- [ ] **Step 2: Write the failing test**

`backend/test/integration/migrate.test.ts`:

```ts
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';

describe('runMigrations', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('applies migrations and is idempotent', async () => {
    const first = await runMigrations(pool);
    expect(first).toContain('001_init.sql');

    const second = await runMigrations(pool);
    expect(second).toEqual([]);

    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'`,
    );
    const columns = rows.map(r => r.column_name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'title',
        'priority',
        'due_date',
        'completed',
        'recurrence',
        'history',
      ]),
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npm test -- test/integration/migrate.test.ts`
Expected: FAIL — `Cannot find module '../../src/db/client'`.

- [ ] **Step 4: Implement the DB client**

`backend/src/db/client.ts`:

```ts
import { Pool, types } from 'pg';
import { env } from '../env';

// Postgres DATE columns (OID 1082) have no timezone; parsing them into a JS
// Date and back can shift by a day depending on the host's local timezone.
// Keep them as the raw 'YYYY-MM-DD' string instead.
types.setTypeParser(1082, val => val);

export const pool = new Pool({ connectionString: env.DATABASE_URL });
```

- [ ] **Step 5: Create the initial migration**

`backend/src/db/migrations/001_init.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  recurrence JSONB,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tasks_user_id_idx ON tasks(user_id);
```

- [ ] **Step 6: Implement the migration runner**

`backend/src/db/migrate.ts`:

```ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Pool } from 'pg';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

export async function runMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file],
      );
      if (rows.length > 0) {
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return applied;
}
```

`backend/src/db/migrateCli.ts`:

```ts
import { pool } from './client';
import { runMigrations } from './migrate';

runMigrations(pool)
  .then(applied => {
    if (applied.length === 0) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
    }
    return pool.end();
  })
  .catch(err => {
    console.error('Migration failed:', err);
    return pool.end().finally(() => process.exit(1));
  });
```

- [ ] **Step 7: Create the test DB helper**

`backend/test/testDb.ts`:

```ts
import { pool } from '../src/db/client';

export async function truncateAll(): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE tasks, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd backend && npm test -- test/integration/migrate.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/db backend/test/testDb.ts backend/test/integration/migrate.test.ts
git commit -m "Add database schema migrations and migration runner"
```

---

## Task 3: Password hashing

**Files:**
- Create: `backend/src/auth/password.ts`
- Test: `backend/test/unit/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>`, used by Tasks 10, 11, 12.

- [ ] **Step 1: Write the failing test**

`backend/test/unit/password.test.ts`:

```ts
import { hashPassword, verifyPassword } from '../../src/auth/password';

describe('password hashing', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toEqual('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/unit/password.test.ts`
Expected: FAIL — `Cannot find module '../../src/auth/password'`.

- [ ] **Step 3: Implement password hashing**

`backend/src/auth/password.ts`:

```ts
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- test/unit/password.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/password.ts backend/test/unit/password.test.ts
git commit -m "Add password hashing utility"
```

---

## Task 4: Token utilities (JWT access tokens + opaque refresh tokens)

**Files:**
- Create: `backend/src/auth/tokens.ts`
- Test: `backend/test/unit/tokens.test.ts`

**Interfaces:**
- Consumes: `env.JWT_SECRET`, `env.ACCESS_TOKEN_TTL`, `env.REFRESH_TOKEN_TTL_DAYS` from Task 1.
- Produces: `signAccessToken(userId: string): string`, `verifyAccessToken(token: string): { sub: string }`, `generateOpaqueToken(): string`, `hashToken(token: string): string`, `refreshTokenExpiry(): Date` — used by Tasks 9, 10, 11, 12.

- [ ] **Step 1: Write the failing test**

`backend/test/unit/tokens.test.ts`:

```ts
import {
  generateOpaqueToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from '../../src/auth/tokens';

describe('access tokens', () => {
  it('signs and verifies a token round-trip', () => {
    const token = signAccessToken('user-123');
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-123');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken('user-123');
    expect(() => verifyAccessToken(`${token}x`)).toThrow();
  });
});

describe('opaque tokens', () => {
  it('generates a distinct token each call', () => {
    expect(generateOpaqueToken()).not.toEqual(generateOpaqueToken());
  });

  it('hashes deterministically', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toEqual(hashToken(token));
  });

  it('computes a refresh expiry in the future', () => {
    expect(refreshTokenExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/unit/tokens.test.ts`
Expected: FAIL — `Cannot find module '../../src/auth/tokens'`.

- [ ] **Step 3: Implement token utilities**

`backend/src/auth/tokens.ts`:

```ts
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env';

export interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { sub: userId };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new Error('Invalid access token payload');
  }
  return { sub: decoded.sub };
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  const days = env.REFRESH_TOKEN_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- test/unit/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/tokens.ts backend/test/unit/tokens.test.ts
git commit -m "Add JWT access token and opaque refresh token utilities"
```

---

## Task 5: Shared types + recurrence service

**Files:**
- Create: `backend/src/types.ts`
- Create: `backend/src/services/recurrence.ts`
- Test: `backend/test/unit/recurrence.test.ts`

**Interfaces:**
- Produces: `Priority`, `RecurrenceType`, `Recurrence` types from `backend/src/types.ts`, used by Tasks 13, 14.
- Produces: `todayISODate(): string`, `computeNextDueDate(recurrence: Recurrence, completedOn: string): string | null` from `backend/src/services/recurrence.ts`, used by Task 13.

- [ ] **Step 1: Write the failing test**

`backend/test/unit/recurrence.test.ts` (mirrors the frontend's `__tests__/recurrence.test.ts` exactly, to guarantee identical behavior):

```ts
import { computeNextDueDate } from '../../src/services/recurrence';

describe('computeNextDueDate', () => {
  it('advances a daily task by the interval', () => {
    expect(computeNextDueDate({ type: 'daily', interval: 1 }, '2026-01-01')).toBe(
      '2026-01-02',
    );
    expect(computeNextDueDate({ type: 'daily', interval: 3 }, '2026-01-01')).toBe(
      '2026-01-04',
    );
  });

  it('advances a weekly task to the next matching weekday', () => {
    expect(
      computeNextDueDate(
        { type: 'weekly', interval: 1, daysOfWeek: [1, 3] },
        '2026-01-01',
      ),
    ).toBe('2026-01-05');
  });

  it('advances a weekly task without explicit days by N weeks', () => {
    expect(computeNextDueDate({ type: 'weekly', interval: 2 }, '2026-01-01')).toBe(
      '2026-01-15',
    );
  });

  it('advances a monthly task, clamping short months', () => {
    expect(computeNextDueDate({ type: 'monthly', interval: 1 }, '2026-01-31')).toBe(
      '2026-02-28',
    );
  });

  it('returns null once the recurrence end date has passed', () => {
    expect(
      computeNextDueDate(
        { type: 'daily', interval: 1, endDate: '2026-01-01' },
        '2026-01-01',
      ),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/unit/recurrence.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/recurrence'`.

- [ ] **Step 3: Implement the shared types**

`backend/src/types.ts`:

```ts
export type Priority = 'low' | 'medium' | 'high';

export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export interface Recurrence {
  type: RecurrenceType;
  interval: number;
  daysOfWeek?: number[];
  endDate?: string;
}
```

- [ ] **Step 4: Implement the recurrence service**

`backend/src/services/recurrence.ts` (ported from `src/utils/recurrence.ts` in the mobile app):

```ts
import type { Recurrence } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISODate(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0,
  ).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

function nextMatchingWeekday(from: Date, daysOfWeek: number[]): Date {
  const sorted = [...daysOfWeek].sort((a, b) => a - b);
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDays(from, offset);
    if (sorted.includes(candidate.getDay())) {
      return candidate;
    }
  }
  return addDays(from, 7);
}

/**
 * Given a recurrence rule and the date an occurrence was just completed on,
 * returns the ISO date of the next occurrence, or null if the recurrence
 * has ended.
 */
export function computeNextDueDate(
  recurrence: Recurrence,
  completedOn: string,
): string | null {
  const from = parseISODate(completedOn);
  let next: Date;

  switch (recurrence.type) {
    case 'daily':
      next = addDays(from, Math.max(1, recurrence.interval));
      break;
    case 'weekly':
      if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
        next = nextMatchingWeekday(from, recurrence.daysOfWeek);
      } else {
        next = addDays(from, 7 * Math.max(1, recurrence.interval));
      }
      break;
    case 'monthly':
      next = addMonths(from, Math.max(1, recurrence.interval));
      break;
    default:
      return null;
  }

  const nextISO = toISODate(next);
  if (recurrence.endDate && nextISO > recurrence.endDate) {
    return null;
  }
  return nextISO;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- test/unit/recurrence.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/types.ts backend/src/services/recurrence.ts backend/test/unit/recurrence.test.ts
git commit -m "Port recurrence rollover logic to the backend"
```

---

## Task 6: Email sender abstraction

**Files:**
- Create: `backend/src/email/sender.ts`
- Create: `backend/src/email/templates.ts`
- Create: `backend/src/email/resendSender.ts`
- Create: `backend/test/fakes/fakeEmailSender.ts`
- Test: `backend/test/unit/templates.test.ts`

**Interfaces:**
- Produces: `EmailSender` interface from `backend/src/email/sender.ts`.
- Produces: `verificationEmail(appBaseUrl, token)`, `passwordResetEmail(appBaseUrl, token)` from `backend/src/email/templates.ts`, used by Tasks 10, 12.
- Produces: `ResendEmailSender` (implements `EmailSender`) from `backend/src/email/resendSender.ts`, used by Task 15.
- Produces: `FakeEmailSender` (implements `EmailSender`, records sent emails) from `backend/test/fakes/fakeEmailSender.ts`, used by every auth integration test from Task 10 onward.

- [ ] **Step 1: Write the failing test**

`backend/test/unit/templates.test.ts`:

```ts
import { passwordResetEmail, verificationEmail } from '../../src/email/templates';

describe('email templates', () => {
  it('embeds the token in the verification link', () => {
    const { html, subject } = verificationEmail('http://localhost:3000', 'abc123');
    expect(subject).toContain('Verify');
    expect(html).toContain('http://localhost:3000/verify-email?token=abc123');
  });

  it('embeds the token in the reset link', () => {
    const { html } = passwordResetEmail('http://localhost:3000', 'xyz789');
    expect(html).toContain('http://localhost:3000/reset-password?token=xyz789');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/unit/templates.test.ts`
Expected: FAIL — `Cannot find module '../../src/email/templates'`.

- [ ] **Step 3: Implement the email sender interface**

`backend/src/email/sender.ts`:

```ts
export interface EmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}
```

- [ ] **Step 4: Implement the email templates**

`backend/src/email/templates.ts`:

```ts
export function verificationEmail(
  appBaseUrl: string,
  token: string,
): { subject: string; html: string } {
  const link = `${appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Verify your email',
    html: `<p>Welcome! Click the link below to verify your email address.</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  };
}

export function passwordResetEmail(
  appBaseUrl: string,
  token: string,
): { subject: string; html: string } {
  const link = `${appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your password',
    html: `<p>We received a request to reset your password. Click the link below to choose a new one.</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  };
}
```

- [ ] **Step 5: Implement the Resend sender and the test fake**

`backend/src/email/resendSender.ts`:

```ts
import { env } from '../env';
import type { EmailSender } from './sender';

export class ResendEmailSender implements EmailSender {
  async send(to: string, subject: string, html: string): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API error (${res.status}): ${body}`);
    }
  }
}
```

`backend/test/fakes/fakeEmailSender.ts`:

```ts
import type { EmailSender } from '../../src/email/sender';

export class FakeEmailSender implements EmailSender {
  public sent: { to: string; subject: string; html: string }[] = [];

  async send(to: string, subject: string, html: string): Promise<void> {
    this.sent.push({ to, subject, html });
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && npm test -- test/unit/templates.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/email backend/test/fakes backend/test/unit/templates.test.ts
git commit -m "Add email sender abstraction with Resend implementation and test fake"
```

---

## Task 7: Auth rate limiting middleware

**Files:**
- Create: `backend/src/middleware/rateLimit.ts`
- Test: `backend/test/unit/rateLimit.test.ts`

**Interfaces:**
- Produces: `createAuthRateLimiter(limit: number, windowMs: number)`, `authRateLimiter` (a configured instance) from `backend/src/middleware/rateLimit.ts`, used by Tasks 10, 11, 12.

- [ ] **Step 1: Write the failing test**

`backend/test/unit/rateLimit.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { createAuthRateLimiter } from '../../src/middleware/rateLimit';

describe('createAuthRateLimiter', () => {
  it('blocks requests past the limit', async () => {
    const app = express();
    app.use(createAuthRateLimiter(2, 60_000));
    app.get('/test', (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(429);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/unit/rateLimit.test.ts`
Expected: FAIL — `Cannot find module '../../src/middleware/rateLimit'`.

- [ ] **Step 3: Implement the rate limiter**

`backend/src/middleware/rateLimit.ts`:

```ts
import rateLimit from 'express-rate-limit';

export function createAuthRateLimiter(limit: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
}

export const authRateLimiter = createAuthRateLimiter(10, 15 * 60 * 1000);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- test/unit/rateLimit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/rateLimit.ts backend/test/unit/rateLimit.test.ts
git commit -m "Add rate limiting middleware for auth endpoints"
```

---

## Task 8: User and token DB query modules

**Files:**
- Create: `backend/src/db/users.ts`
- Create: `backend/src/db/tokens.ts`
- Test: `backend/test/integration/db-users.test.ts`
- Test: `backend/test/integration/db-tokens.test.ts`

**Interfaces:**
- Consumes: `pool` from Task 2.
- Produces (`db/users.ts`): `createUser(email, passwordHash)`, `findUserByEmail(email)`, `findUserById(id)`, `markEmailVerified(userId)`, `updatePasswordHash(userId, passwordHash)` — a `UserRow` has `{ id, email, passwordHash, emailVerified, createdAt, updatedAt }`. Used by Tasks 10, 11, 12, 13, 14.
- Produces (`db/tokens.ts`): `createEmailVerificationToken`, `findValidEmailVerificationToken`, `markEmailVerificationTokenUsed`, `createPasswordResetToken`, `findValidPasswordResetToken`, `markPasswordResetTokenUsed`, `createRefreshToken`, `findRefreshTokenByHash`, `revokeRefreshToken`, `revokeAllRefreshTokensForUser`. Used by Tasks 10, 11, 12.

- [ ] **Step 1: Write the failing tests**

`backend/test/integration/db-users.test.ts`:

```ts
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import {
  createUser,
  findUserByEmail,
  findUserById,
  markEmailVerified,
  updatePasswordHash,
} from '../../src/db/users';

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('user queries', () => {
  it('creates and finds a user by email and id, lowercasing the email', async () => {
    const user = await createUser('Test@Example.com', 'hashed');
    expect(user.email).toBe('test@example.com');
    expect(user.emailVerified).toBe(false);

    const byEmail = await findUserByEmail('test@example.com');
    expect(byEmail?.id).toBe(user.id);

    const byId = await findUserById(user.id);
    expect(byId?.email).toBe('test@example.com');
  });

  it('rejects a duplicate email', async () => {
    await createUser('dupe@example.com', 'hashed');
    await expect(createUser('dupe@example.com', 'other-hash')).rejects.toThrow();
  });

  it('marks email verified', async () => {
    const user = await createUser('verify@example.com', 'hashed');
    await markEmailVerified(user.id);
    const updated = await findUserById(user.id);
    expect(updated?.emailVerified).toBe(true);
  });

  it('updates the password hash', async () => {
    const user = await createUser('pw@example.com', 'hashed');
    await updatePasswordHash(user.id, 'new-hash');
    const updated = await findUserById(user.id);
    expect(updated?.passwordHash).toBe('new-hash');
  });
});
```

`backend/test/integration/db-tokens.test.ts`:

```ts
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createUser } from '../../src/db/users';
import {
  createEmailVerificationToken,
  createPasswordResetToken,
  createRefreshToken,
  findRefreshTokenByHash,
  findValidEmailVerificationToken,
  findValidPasswordResetToken,
  markEmailVerificationTokenUsed,
  markPasswordResetTokenUsed,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
} from '../../src/db/tokens';

let userId: string;

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  const user = await createUser(`user-${Math.random()}@example.com`, 'hash');
  userId = user.id;
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('email verification tokens', () => {
  it('finds a valid token and rejects it once used', async () => {
    const future = new Date(Date.now() + 60_000);
    const id = await createEmailVerificationToken(userId, 'hash-a', future);

    expect(await findValidEmailVerificationToken('hash-a')).not.toBeNull();

    await markEmailVerificationTokenUsed(id);
    expect(await findValidEmailVerificationToken('hash-a')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const past = new Date(Date.now() - 60_000);
    await createEmailVerificationToken(userId, 'hash-b', past);
    expect(await findValidEmailVerificationToken('hash-b')).toBeNull();
  });
});

describe('password reset tokens', () => {
  it('finds a valid token and rejects it once used', async () => {
    const future = new Date(Date.now() + 60_000);
    const id = await createPasswordResetToken(userId, 'hash-c', future);

    expect(await findValidPasswordResetToken('hash-c')).not.toBeNull();

    await markPasswordResetTokenUsed(id);
    expect(await findValidPasswordResetToken('hash-c')).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('finds a token by hash and revokes it', async () => {
    const future = new Date(Date.now() + 60_000);
    const id = await createRefreshToken(userId, 'hash-d', future);

    const found = await findRefreshTokenByHash('hash-d');
    expect(found?.id).toBe(id);
    expect(found?.revokedAt).toBeNull();

    await revokeRefreshToken(id);
    const revoked = await findRefreshTokenByHash('hash-d');
    expect(revoked?.revokedAt).not.toBeNull();
  });

  it('revokes every refresh token for a user', async () => {
    const future = new Date(Date.now() + 60_000);
    await createRefreshToken(userId, 'hash-e', future);
    await createRefreshToken(userId, 'hash-f', future);

    await revokeAllRefreshTokensForUser(userId);

    const first = await findRefreshTokenByHash('hash-e');
    const second = await findRefreshTokenByHash('hash-f');
    expect(first?.revokedAt).not.toBeNull();
    expect(second?.revokedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npm test -- test/integration/db-users.test.ts test/integration/db-tokens.test.ts`
Expected: FAIL — `Cannot find module '../../src/db/users'`.

- [ ] **Step 3: Implement the user query module**

`backend/src/db/users.ts`:

```ts
import { pool } from './client';

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: any): UserRow {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    emailVerified: row.email_verified,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email.toLowerCase(), passwordHash],
  );
  return mapRow(rows[0]);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`,
    [userId],
  );
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
    [passwordHash, userId],
  );
}
```

- [ ] **Step 4: Implement the token query module**

`backend/src/db/tokens.ts`:

```ts
import { pool } from './client';

interface TokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

function mapTokenRow(row: any): TokenRow {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

// Email verification tokens

export async function createEmailVerificationToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [userId, tokenHash, expiresAt],
  );
  return rows[0].id;
}

export async function findValidEmailVerificationToken(
  tokenHash: string,
): Promise<TokenRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM email_verification_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? mapTokenRow(rows[0]) : null;
}

export async function markEmailVerificationTokenUsed(id: string): Promise<void> {
  await pool.query(
    `UPDATE email_verification_tokens SET used_at = now() WHERE id = $1`,
    [id],
  );
}

// Password reset tokens

export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [userId, tokenHash, expiresAt],
  );
  return rows[0].id;
}

export async function findValidPasswordResetToken(
  tokenHash: string,
): Promise<TokenRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? mapTokenRow(rows[0]) : null;
}

export async function markPasswordResetTokenUsed(id: string): Promise<void> {
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`,
    [id],
  );
}

// Refresh tokens

export interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
}

function mapRefreshRow(row: any): RefreshTokenRow {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    replacedBy: row.replaced_by,
  };
}

export async function createRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [userId, tokenHash, expiresAt],
  );
  return rows[0].id;
}

export async function findRefreshTokenByHash(
  tokenHash: string,
): Promise<RefreshTokenRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  return rows[0] ? mapRefreshRow(rows[0]) : null;
}

export async function revokeRefreshToken(
  id: string,
  replacedById?: string,
): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
    [id, replacedById ?? null],
  );
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npm test -- test/integration/db-users.test.ts test/integration/db-tokens.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/users.ts backend/src/db/tokens.ts backend/test/integration/db-users.test.ts backend/test/integration/db-tokens.test.ts
git commit -m "Add user and token DB query modules"
```

---

## Task 9: requireAuth middleware

**Files:**
- Create: `backend/src/auth/middleware.ts`
- Test: `backend/test/unit/middleware.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` from Task 4.
- Produces: `requireAuth` (Express middleware), `AuthedRequest` (adds `userId?: string` to `Request`) from `backend/src/auth/middleware.ts`, used by Task 14.

- [ ] **Step 1: Write the failing test**

`backend/test/unit/middleware.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { AuthedRequest, requireAuth } from '../../src/auth/middleware';
import { signAccessToken } from '../../src/auth/tokens';

function buildApp() {
  const app = express();
  app.get('/protected', requireAuth, (req: AuthedRequest, res) => {
    res.status(200).json({ userId: req.userId });
  });
  return app;
}

describe('requireAuth', () => {
  it('rejects a request with no auth header', async () => {
    await request(buildApp()).get('/protected').expect(401);
  });

  it('rejects an invalid token', async () => {
    await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer garbage')
      .expect(401);
  });

  it('accepts a valid token and attaches userId', async () => {
    const token = signAccessToken('user-42');
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.userId).toBe('user-42');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/unit/middleware.test.ts`
Expected: FAIL — `Cannot find module '../../src/auth/middleware'`.

- [ ] **Step 3: Implement the middleware**

`backend/src/auth/middleware.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from './tokens';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- test/unit/middleware.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/middleware.ts backend/test/unit/middleware.test.ts
git commit -m "Add requireAuth middleware"
```

---

## Task 10: Auth routes — register, verify-email, resend-verification

**Files:**
- Create: `backend/src/routes/auth.ts`
- Test: `backend/test/integration/auth-register.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 3); `generateOpaqueToken`, `hashToken` (Task 4); `EmailSender`, `verificationEmail` (Task 6); `authRateLimiter` (Task 7); `createUser`, `findUserByEmail` (Task 8); `createEmailVerificationToken`, `findValidEmailVerificationToken`, `markEmailVerificationTokenUsed` (Task 8).
- Produces: `createAuthRouter(emailSender: EmailSender): Router` from `backend/src/routes/auth.ts` — extended in Tasks 11 and 12, mounted in Task 15.

- [ ] **Step 1: Write the failing test**

`backend/test/integration/auth-register.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createAuthRouter } from '../../src/routes/auth';
import { FakeEmailSender } from '../fakes/fakeEmailSender';

function buildApp(emailSender: FakeEmailSender) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(emailSender));
  return app;
}

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /auth/register', () => {
  it('creates an unverified user and sends a verification email', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildApp(emailSender);

    await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'longenoughpassword' })
      .expect(200);

    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('new@example.com');
    expect(emailSender.sent[0].html).toMatch(/verify-email\?token=/);
  });

  it('returns the same response for a duplicate email and does not overwrite the account', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildApp(emailSender);

    const first = await request(app)
      .post('/auth/register')
      .send({ email: 'dupe@example.com', password: 'firstpassword1' })
      .expect(200);
    const second = await request(app)
      .post('/auth/register')
      .send({ email: 'dupe@example.com', password: 'secondpassword2' })
      .expect(200);

    expect(first.body).toEqual(second.body);
    expect(emailSender.sent).toHaveLength(1);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const app = buildApp(new FakeEmailSender());
    await request(app)
      .post('/auth/register')
      .send({ email: 'short@example.com', password: 'short' })
      .expect(400);
  });
});

describe('POST /auth/verify-email', () => {
  it('verifies the account with the token from the registration email', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildApp(emailSender);

    await request(app)
      .post('/auth/register')
      .send({ email: 'verify@example.com', password: 'longenoughpassword' })
      .expect(200);
    const token = emailSender.sent[0].html.match(/token=([a-f0-9]+)/)![1];

    await request(app).post('/auth/verify-email').send({ token }).expect(200);
    await request(app).post('/auth/verify-email').send({ token }).expect(400);
  });

  it('rejects an unknown token', async () => {
    const app = buildApp(new FakeEmailSender());
    await request(app)
      .post('/auth/verify-email')
      .send({ token: 'not-a-real-token' })
      .expect(400);
  });

  it('rejects an expired token', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildApp(emailSender);
    await request(app)
      .post('/auth/register')
      .send({ email: 'expired@example.com', password: 'longenoughpassword' })
      .expect(200);
    await pool.query(`UPDATE email_verification_tokens SET expires_at = now() - interval '1 day'`);
    const token = emailSender.sent[0].html.match(/token=([a-f0-9]+)/)![1];
    await request(app).post('/auth/verify-email').send({ token }).expect(400);
  });
});

describe('POST /auth/resend-verification', () => {
  it('sends a new verification email for an unverified account', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildApp(emailSender);

    await request(app)
      .post('/auth/register')
      .send({ email: 'resend@example.com', password: 'longenoughpassword' })
      .expect(200);
    await request(app)
      .post('/auth/resend-verification')
      .send({ email: 'resend@example.com' })
      .expect(200);

    expect(emailSender.sent).toHaveLength(2);
  });

  it('returns 200 without sending anything for an unknown email', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildApp(emailSender);
    await request(app)
      .post('/auth/resend-verification')
      .send({ email: 'unknown@example.com' })
      .expect(200);
    expect(emailSender.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/integration/auth-register.test.ts`
Expected: FAIL — `Cannot find module '../../src/routes/auth'`.

- [ ] **Step 3: Implement the auth router (registration endpoints)**

`backend/src/routes/auth.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { hashPassword } from '../auth/password';
import { generateOpaqueToken, hashToken } from '../auth/tokens';
import type { EmailSender } from '../email/sender';
import { verificationEmail } from '../email/templates';
import { env } from '../env';
import {
  createEmailVerificationToken,
  findValidEmailVerificationToken,
  markEmailVerificationTokenUsed,
} from '../db/tokens';
import { createUser, findUserByEmail, markEmailVerified } from '../db/users';
import { authRateLimiter } from '../middleware/rateLimit';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const GENERIC_REGISTER_MESSAGE = {
  message: 'If this email can be registered, check your inbox for a verification link.',
};

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

async function sendVerificationEmail(
  emailSender: EmailSender,
  userId: string,
  email: string,
): Promise<void> {
  const token = generateOpaqueToken();
  await createEmailVerificationToken(
    userId,
    hashToken(token),
    new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  );
  const { subject, html } = verificationEmail(env.APP_BASE_URL, token);
  await emailSender.send(email, subject, html);
}

export function createAuthRouter(emailSender: EmailSender): Router {
  const router = Router();

  router.post('/register', authRateLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }
    const { email, password } = parsed.data;

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(200).json(GENERIC_REGISTER_MESSAGE);
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash);
    await sendVerificationEmail(emailSender, user.id, user.email);

    res.status(200).json(GENERIC_REGISTER_MESSAGE);
  });

  router.post('/verify-email', async (req, res) => {
    const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid token' });
      return;
    }
    const record = await findValidEmailVerificationToken(hashToken(parsed.data.token));
    if (!record) {
      res.status(400).json({ error: 'Invalid or expired token' });
      return;
    }
    await markEmailVerified(record.userId);
    await markEmailVerificationTokenUsed(record.id);
    res.status(200).json({ message: 'Email verified' });
  });

  router.post('/resend-verification', authRateLimiter, async (req, res) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }
    const user = await findUserByEmail(parsed.data.email);
    if (user && !user.emailVerified) {
      await sendVerificationEmail(emailSender, user.id, user.email);
    }
    res.status(200).json({
      message: 'If this account exists and is unverified, a new link has been sent.',
    });
  });

  return router;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- test/integration/auth-register.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/test/integration/auth-register.test.ts
git commit -m "Add registration, email verification, and resend-verification endpoints"
```

---

## Task 11: Auth routes — login, refresh, logout

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Test: `backend/test/integration/auth-login.test.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 3); `signAccessToken`, `generateOpaqueToken`, `hashToken`, `refreshTokenExpiry` (Task 4); `createRefreshToken`, `findRefreshTokenByHash`, `revokeRefreshToken`, `revokeAllRefreshTokensForUser` (Task 8); the router from Task 10.
- Produces: `/auth/login`, `/auth/refresh`, `/auth/logout` added to the router from `createAuthRouter`.

- [ ] **Step 1: Write the failing test**

`backend/test/integration/auth-login.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createAuthRouter } from '../../src/routes/auth';
import { FakeEmailSender } from '../fakes/fakeEmailSender';

function buildApp() {
  const emailSender = new FakeEmailSender();
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(emailSender));
  return { app, emailSender };
}

async function registerAndVerify(
  app: express.Express,
  emailSender: FakeEmailSender,
  email: string,
  password: string,
) {
  await request(app).post('/auth/register').send({ email, password }).expect(200);
  const token = emailSender.sent[emailSender.sent.length - 1].html.match(
    /token=([a-f0-9]+)/,
  )![1];
  await request(app).post('/auth/verify-email').send({ token }).expect(200);
}

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /auth/login', () => {
  it('rejects an unverified account', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/auth/register')
      .send({ email: 'unverified@example.com', password: 'longenoughpassword' })
      .expect(200);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'unverified@example.com', password: 'longenoughpassword' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('logs in a verified account and returns tokens', async () => {
    const { app, emailSender } = buildApp();
    await registerAndVerify(app, emailSender, 'login@example.com', 'longenoughpassword');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'longenoughpassword' })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it('returns an identical error for a wrong password and an unknown email', async () => {
    const { app, emailSender } = buildApp();
    await registerAndVerify(app, emailSender, 'known@example.com', 'longenoughpassword');
    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email: 'known@example.com', password: 'wrongpassword' })
      .expect(401);
    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({ email: 'unknown@example.com', password: 'whatever1' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const { app, emailSender } = buildApp();
    await registerAndVerify(app, emailSender, 'refresh@example.com', 'longenoughpassword');
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'refresh@example.com', password: 'longenoughpassword' })
      .expect(200);

    const refreshed = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);
  });

  it('revokes every session when a rotated refresh token is reused', async () => {
    const { app, emailSender } = buildApp();
    await registerAndVerify(app, emailSender, 'reuse@example.com', 'longenoughpassword');
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'reuse@example.com', password: 'longenoughpassword' })
      .expect(200);

    const refreshed = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the refresh token so it can no longer be used', async () => {
    const { app, emailSender } = buildApp();
    await registerAndVerify(app, emailSender, 'logout@example.com', 'longenoughpassword');
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'logout@example.com', password: 'longenoughpassword' })
      .expect(200);

    await request(app)
      .post('/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/integration/auth-login.test.ts`
Expected: FAIL — `/auth/login` returns 404 (route doesn't exist yet).

- [ ] **Step 3: Extend the auth router**

Modify `backend/src/routes/auth.ts`:

1. Update the top-level imports to add what login/refresh/logout need — merge these into the Task 10 import lines rather than duplicating them:

```ts
import { hashPassword, verifyPassword } from '../auth/password';
import {
  generateOpaqueToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../auth/tokens';
import {
  createEmailVerificationToken,
  createRefreshToken,
  findRefreshTokenByHash,
  findValidEmailVerificationToken,
  markEmailVerificationTokenUsed,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
} from '../db/tokens';
import { createUser, findUserByEmail, markEmailVerified } from '../db/users';
```

2. Insert the following routes inside `createAuthRouter`, after the `/resend-verification` handler and before `return router;`:

```ts
  router.post('/login', authRateLimiter, async (req, res) => {
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }
    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (!user.emailVerified) {
      res.status(403).json({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
      return;
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = generateOpaqueToken();
    await createRefreshToken(user.id, hashToken(refreshToken), refreshTokenExpiry());

    res.status(200).json({ accessToken, refreshToken });
  });

  router.post('/refresh', async (req, res) => {
    const parsed = z.object({ refreshToken: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid refresh token' });
      return;
    }
    const record = await findRefreshTokenByHash(hashToken(parsed.data.refreshToken));
    if (!record || record.expiresAt.getTime() < Date.now()) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }
    if (record.revokedAt) {
      await revokeAllRefreshTokensForUser(record.userId);
      res.status(401).json({ error: 'Refresh token has been revoked' });
      return;
    }

    const newRefreshToken = generateOpaqueToken();
    const newTokenId = await createRefreshToken(
      record.userId,
      hashToken(newRefreshToken),
      refreshTokenExpiry(),
    );
    await revokeRefreshToken(record.id, newTokenId);

    const accessToken = signAccessToken(record.userId);
    res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  });

  router.post('/logout', async (req, res) => {
    const parsed = z.object({ refreshToken: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid refresh token' });
      return;
    }
    const record = await findRefreshTokenByHash(hashToken(parsed.data.refreshToken));
    if (record && !record.revokedAt) {
      await revokeRefreshToken(record.id);
    }
    res.status(200).json({ message: 'Logged out' });
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- test/integration/auth-login.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full auth test suite to check for regressions**

Run: `cd backend && npm test -- test/integration/auth-register.test.ts test/integration/auth-login.test.ts`
Expected: PASS (both files)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/auth.ts backend/test/integration/auth-login.test.ts
git commit -m "Add login, refresh, and logout endpoints with refresh token rotation"
```

---

## Task 12: Auth routes — forgot-password, reset-password

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Test: `backend/test/integration/auth-password-reset.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 3); `passwordResetEmail` (Task 6); `createPasswordResetToken`, `findValidPasswordResetToken`, `markPasswordResetTokenUsed`, `revokeAllRefreshTokensForUser` (Task 8); `updatePasswordHash` (Task 8); the router from Tasks 10–11.
- Produces: `/auth/forgot-password`, `/auth/reset-password` added to the router from `createAuthRouter`.

- [ ] **Step 1: Write the failing test**

`backend/test/integration/auth-password-reset.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createAuthRouter } from '../../src/routes/auth';
import { FakeEmailSender } from '../fakes/fakeEmailSender';

function buildApp() {
  const emailSender = new FakeEmailSender();
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(emailSender));
  return { app, emailSender };
}

async function registerAndVerify(
  app: express.Express,
  emailSender: FakeEmailSender,
  email: string,
  password: string,
) {
  await request(app).post('/auth/register').send({ email, password }).expect(200);
  const token = emailSender.sent[emailSender.sent.length - 1].html.match(
    /token=([a-f0-9]+)/,
  )![1];
  await request(app).post('/auth/verify-email').send({ token }).expect(200);
}

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /auth/forgot-password', () => {
  it('returns 200 for both a known and an unknown email, only emailing the known one', async () => {
    const { app, emailSender } = buildApp();
    await registerAndVerify(app, emailSender, 'known@example.com', 'longenoughpassword');
    emailSender.sent = [];

    const known = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'known@example.com' })
      .expect(200);
    const unknown = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'unknown@example.com' })
      .expect(200);

    expect(known.body).toEqual(unknown.body);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('known@example.com');
  });
});

describe('POST /auth/reset-password', () => {
  it('updates the password and revokes existing sessions', async () => {
    const { app, emailSender } = buildApp();
    await registerAndVerify(app, emailSender, 'reset@example.com', 'oldpassword1');
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'reset@example.com', password: 'oldpassword1' })
      .expect(200);

    await request(app).post('/auth/forgot-password').send({ email: 'reset@example.com' }).expect(200);
    const resetToken = emailSender.sent[emailSender.sent.length - 1].html.match(
      /token=([a-f0-9]+)/,
    )![1];

    await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'newpassword2' })
      .expect(200);

    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    await request(app)
      .post('/auth/login')
      .send({ email: 'reset@example.com', password: 'oldpassword1' })
      .expect(401);
    await request(app)
      .post('/auth/login')
      .send({ email: 'reset@example.com', password: 'newpassword2' })
      .expect(200);
  });

  it('rejects an expired reset token', async () => {
    const { app, emailSender } = buildApp();
    await registerAndVerify(app, emailSender, 'expiredreset@example.com', 'oldpassword1');
    await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'expiredreset@example.com' })
      .expect(200);
    await pool.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 hour'`);
    const resetToken = emailSender.sent[emailSender.sent.length - 1].html.match(
      /token=([a-f0-9]+)/,
    )![1];
    await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'newpassword2' })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/integration/auth-password-reset.test.ts`
Expected: FAIL — `/auth/forgot-password` returns 404 (route doesn't exist yet).

- [ ] **Step 3: Extend the auth router**

Modify `backend/src/routes/auth.ts`:

1. Add to the top-level imports:

```ts
import {
  createPasswordResetToken,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
} from '../db/tokens';
import { updatePasswordHash } from '../db/users';
import { passwordResetEmail } from '../email/templates';
```

   (Merge these into the existing `../db/tokens`, `../db/users`, and `../email/templates` import lines from Tasks 10–11 rather than duplicating them.)

2. Insert the following routes inside `createAuthRouter`, after the `/logout` handler and before `return router;`:

```ts
  router.post('/forgot-password', authRateLimiter, async (req, res) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }
    const user = await findUserByEmail(parsed.data.email);
    if (user) {
      const token = generateOpaqueToken();
      await createPasswordResetToken(
        user.id,
        hashToken(token),
        new Date(Date.now() + 60 * 60 * 1000),
      );
      const { subject, html } = passwordResetEmail(env.APP_BASE_URL, token);
      await emailSender.send(user.email, subject, html);
    }
    res.status(200).json({ message: 'If this account exists, a reset link has been sent.' });
  });

  router.post('/reset-password', async (req, res) => {
    const parsed = z
      .object({ token: z.string().min(1), newPassword: z.string().min(8) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid token or password' });
      return;
    }
    const record = await findValidPasswordResetToken(hashToken(parsed.data.token));
    if (!record) {
      res.status(400).json({ error: 'Invalid or expired token' });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await updatePasswordHash(record.userId, passwordHash);
    await markPasswordResetTokenUsed(record.id);
    await revokeAllRefreshTokensForUser(record.userId);
    res.status(200).json({ message: 'Password updated' });
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- test/integration/auth-password-reset.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full auth test suite to check for regressions**

Run: `cd backend && npm test -- test/integration/auth-register.test.ts test/integration/auth-login.test.ts test/integration/auth-password-reset.test.ts`
Expected: PASS (all three files)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/auth.ts backend/test/integration/auth-password-reset.test.ts
git commit -m "Add forgot-password and reset-password endpoints"
```

---

## Task 13: Task DB queries + task service (toggle logic)

**Files:**
- Create: `backend/src/db/tasks.ts`
- Create: `backend/src/services/taskService.ts`
- Test: `backend/test/integration/taskService.test.ts`

**Interfaces:**
- Consumes: `pool` (Task 2); `Recurrence` (Task 5); `computeNextDueDate`, `todayISODate` (Task 5); `createUser` (Task 8, test-only).
- Produces (`db/tasks.ts`): `TaskRow`, `NewTaskRow`, `TaskUpdateRow` types; `listTasksForUser(userId)`, `findTaskForUser(userId, taskId)`, `createTaskForUser(userId, input)`, `updateTaskForUser(userId, taskId, changes)`, `deleteTaskForUser(userId, taskId)`.
- Produces (`services/taskService.ts`): `listTasks(userId)`, `createTask(userId, input)`, `updateTask(userId, taskId, changes)`, `deleteTask(userId, taskId)`, `toggleTaskComplete(userId, taskId)` — all used by Task 14.

- [ ] **Step 1: Write the failing test**

`backend/test/integration/taskService.test.ts`:

```ts
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createUser } from '../../src/db/users';
import { createTask, toggleTaskComplete } from '../../src/services/taskService';
import { todayISODate } from '../../src/services/recurrence';

let userId: string;

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  const user = await createUser(`user-${Math.random()}@example.com`, 'hash');
  userId = user.id;
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('toggleTaskComplete', () => {
  it('flips completed for a non-recurring task, and back again', async () => {
    const task = await createTask(userId, { title: 'One-off', priority: 'medium' });

    const toggled = await toggleTaskComplete(userId, task.id);
    expect(toggled?.completed).toBe(true);

    const toggledAgain = await toggleTaskComplete(userId, task.id);
    expect(toggledAgain?.completed).toBe(false);
  });

  it('rolls a recurring task forward and logs today in history', async () => {
    const task = await createTask(userId, {
      title: 'Daily',
      priority: 'medium',
      dueDate: '2020-01-01',
      recurrence: { type: 'daily', interval: 1 },
    });

    const today = todayISODate();
    const toggled = await toggleTaskComplete(userId, task.id);
    expect(toggled?.completed).toBe(false);
    expect(toggled?.history).toEqual([today]);
    expect(toggled?.dueDate).not.toBe('2020-01-01');
  });

  it('undoes completion when toggled twice on the same day', async () => {
    const task = await createTask(userId, {
      title: 'Daily',
      priority: 'medium',
      dueDate: '2020-01-01',
      recurrence: { type: 'daily', interval: 1 },
    });

    const first = await toggleTaskComplete(userId, task.id);
    expect(first?.history).toEqual([todayISODate()]);

    const second = await toggleTaskComplete(userId, task.id);
    expect(second?.history).toEqual([]);
    expect(second?.completed).toBe(false);
  });

  it('marks completed once the recurrence has ended', async () => {
    const today = todayISODate();
    const task = await createTask(userId, {
      title: 'Ending soon',
      priority: 'low',
      dueDate: today,
      recurrence: { type: 'daily', interval: 1, endDate: today },
    });

    const toggled = await toggleTaskComplete(userId, task.id);
    expect(toggled?.completed).toBe(true);
  });

  it('returns null for a task belonging to another user', async () => {
    const other = await createUser(`other-${Math.random()}@example.com`, 'hash');
    const task = await createTask(other.id, { title: 'Not yours', priority: 'low' });
    const result = await toggleTaskComplete(userId, task.id);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/integration/taskService.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/taskService'`.

- [ ] **Step 3: Implement the task DB query module**

`backend/src/db/tasks.ts`:

```ts
import { pool } from './client';
import type { Priority, Recurrence } from '../types';

export interface TaskRow {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  priority: Priority;
  dueDate: string | null;
  completed: boolean;
  recurrence: Recurrence | null;
  history: string[];
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: any): TaskRow {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    dueDate: row.due_date,
    completed: row.completed,
    recurrence: row.recurrence,
    history: row.history,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface NewTaskRow {
  title: string;
  notes?: string;
  priority: Priority;
  dueDate?: string;
  recurrence?: Recurrence;
}

export async function listTasksForUser(userId: string): Promise<TaskRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function findTaskForUser(
  userId: string,
  taskId: string,
): Promise<TaskRow | null> {
  const { rows } = await pool.query(`SELECT * FROM tasks WHERE id = $1 AND user_id = $2`, [
    taskId,
    userId,
  ]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createTaskForUser(
  userId: string,
  input: NewTaskRow,
): Promise<TaskRow> {
  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, title, notes, priority, due_date, recurrence, history)
     VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb)
     RETURNING *`,
    [
      userId,
      input.title.trim(),
      input.notes?.trim() || null,
      input.priority,
      input.dueDate ?? null,
      input.recurrence ? JSON.stringify(input.recurrence) : null,
    ],
  );
  return mapRow(rows[0]);
}

export interface TaskUpdateRow {
  title?: string;
  notes?: string;
  priority?: Priority;
  dueDate?: string | null;
  recurrence?: Recurrence | null;
  completed?: boolean;
  history?: string[];
}

export async function updateTaskForUser(
  userId: string,
  taskId: string,
  changes: TaskUpdateRow,
): Promise<TaskRow | null> {
  const existing = await findTaskForUser(userId, taskId);
  if (!existing) {
    return null;
  }

  const { rows } = await pool.query(
    `UPDATE tasks SET
       title = $3,
       notes = $4,
       priority = $5,
       due_date = $6,
       recurrence = $7,
       completed = $8,
       history = $9,
       updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      taskId,
      userId,
      changes.title !== undefined ? changes.title.trim() : existing.title,
      changes.notes !== undefined ? changes.notes.trim() || null : existing.notes,
      changes.priority ?? existing.priority,
      changes.dueDate !== undefined ? changes.dueDate : existing.dueDate,
      changes.recurrence !== undefined
        ? changes.recurrence
          ? JSON.stringify(changes.recurrence)
          : null
        : existing.recurrence
          ? JSON.stringify(existing.recurrence)
          : null,
      changes.completed !== undefined ? changes.completed : existing.completed,
      JSON.stringify(changes.history !== undefined ? changes.history : existing.history),
    ],
  );
  return mapRow(rows[0]);
}

export async function deleteTaskForUser(userId: string, taskId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM tasks WHERE id = $1 AND user_id = $2`, [
    taskId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}
```

- [ ] **Step 4: Implement the task service**

`backend/src/services/taskService.ts`:

```ts
import {
  createTaskForUser,
  deleteTaskForUser,
  findTaskForUser,
  listTasksForUser,
  updateTaskForUser,
  type NewTaskRow,
  type TaskRow,
  type TaskUpdateRow,
} from '../db/tasks';
import { computeNextDueDate, todayISODate } from './recurrence';

export async function listTasks(userId: string): Promise<TaskRow[]> {
  return listTasksForUser(userId);
}

export async function createTask(userId: string, input: NewTaskRow): Promise<TaskRow> {
  return createTaskForUser(userId, input);
}

export async function updateTask(
  userId: string,
  taskId: string,
  changes: TaskUpdateRow,
): Promise<TaskRow | null> {
  return updateTaskForUser(userId, taskId, changes);
}

export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  return deleteTaskForUser(userId, taskId);
}

/**
 * Mirrors the frontend's toggleTaskComplete semantics exactly:
 * - Non-recurring: flips `completed`.
 * - Recurring, not done today: logs today in history, rolls dueDate to the
 *   next occurrence (or marks completed if the recurrence has ended).
 * - Recurring, already done today: undoes today's completion.
 */
export async function toggleTaskComplete(
  userId: string,
  taskId: string,
): Promise<TaskRow | null> {
  const task = await findTaskForUser(userId, taskId);
  if (!task) {
    return null;
  }

  if (!task.recurrence) {
    return updateTaskForUser(userId, taskId, { completed: !task.completed });
  }

  const today = todayISODate();
  const alreadyDoneToday = task.history.includes(today);

  if (alreadyDoneToday) {
    return updateTaskForUser(userId, taskId, {
      history: task.history.filter(d => d !== today),
    });
  }

  const nextDue = computeNextDueDate(task.recurrence, today);
  return updateTaskForUser(userId, taskId, {
    history: [...task.history, today],
    dueDate: nextDue ?? task.dueDate,
    completed: nextDue === null,
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- test/integration/taskService.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/tasks.ts backend/src/services/taskService.ts backend/test/integration/taskService.test.ts
git commit -m "Add task DB queries and task service with toggle-complete logic"
```

---

## Task 14: Task HTTP routes + cross-user isolation

**Files:**
- Create: `backend/src/routes/tasks.ts`
- Test: `backend/test/integration/tasks.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `AuthedRequest` (Task 9); `createTask`, `deleteTask`, `listTasks`, `toggleTaskComplete`, `updateTask` (Task 13); `signAccessToken` (Task 4, test-only); `createUser` (Task 8, test-only).
- Produces: `createTasksRouter(): Router` from `backend/src/routes/tasks.ts`, mounted in Task 15.

- [ ] **Step 1: Write the failing test**

`backend/test/integration/tasks.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createUser } from '../../src/db/users';
import { signAccessToken } from '../../src/auth/tokens';
import { createTasksRouter } from '../../src/routes/tasks';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/tasks', createTasksRouter());
  return app;
}

async function authHeaderFor(email: string): Promise<{ userId: string; header: string }> {
  const user = await createUser(email, 'hash');
  return { userId: user.id, header: `Bearer ${signAccessToken(user.id)}` };
}

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('tasks API', () => {
  it('rejects requests with no access token', async () => {
    const app = buildApp();
    await request(app).get('/tasks').expect(401);
  });

  it('creates, lists, updates, toggles, and deletes a task', async () => {
    const app = buildApp();
    const { header } = await authHeaderFor('owner@example.com');

    const created = await request(app)
      .post('/tasks')
      .set('Authorization', header)
      .send({ title: 'Write plan', priority: 'high' })
      .expect(201);

    const list = await request(app).get('/tasks').set('Authorization', header).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);

    const updated = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', header)
      .send({ title: 'Write the plan' })
      .expect(200);
    expect(updated.body.title).toBe('Write the plan');

    const toggled = await request(app)
      .post(`/tasks/${created.body.id}/toggle`)
      .set('Authorization', header)
      .expect(200);
    expect(toggled.body.completed).toBe(true);

    await request(app)
      .delete(`/tasks/${created.body.id}`)
      .set('Authorization', header)
      .expect(204);
    const afterDelete = await request(app).get('/tasks').set('Authorization', header).expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });

  it("returns 404, not the task, when a user requests another user's task by id", async () => {
    const app = buildApp();
    const owner = await authHeaderFor('owner2@example.com');
    const intruder = await authHeaderFor('intruder@example.com');

    const created = await request(app)
      .post('/tasks')
      .set('Authorization', owner.header)
      .send({ title: 'Private task', priority: 'low' })
      .expect(201);

    const intruderList = await request(app)
      .get('/tasks')
      .set('Authorization', intruder.header)
      .expect(200);
    expect(intruderList.body).toHaveLength(0);

    await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', intruder.header)
      .send({ title: 'Hijacked' })
      .expect(404);

    await request(app)
      .delete(`/tasks/${created.body.id}`)
      .set('Authorization', intruder.header)
      .expect(404);

    await request(app)
      .post(`/tasks/${created.body.id}/toggle`)
      .set('Authorization', intruder.header)
      .expect(404);
  });

  it('rejects an invalid task payload', async () => {
    const app = buildApp();
    const { header } = await authHeaderFor('invalid@example.com');
    await request(app)
      .post('/tasks')
      .set('Authorization', header)
      .send({ title: '', priority: 'medium' })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/integration/tasks.test.ts`
Expected: FAIL — `Cannot find module '../../src/routes/tasks'`.

- [ ] **Step 3: Implement the tasks router**

`backend/src/routes/tasks.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import {
  createTask,
  deleteTask,
  listTasks,
  toggleTaskComplete,
  updateTask,
} from '../services/taskService';

const recurrenceSchema = z.object({
  type: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().positive(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  endDate: z.string().optional(),
});

const newTaskSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().optional(),
  recurrence: recurrenceSchema.optional(),
});

const updateTaskSchema = newTaskSchema.partial();

export function createTasksRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req: AuthedRequest, res) => {
    const tasks = await listTasks(req.userId!);
    res.status(200).json(tasks);
  });

  router.post('/', async (req: AuthedRequest, res) => {
    const parsed = newTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid task' });
      return;
    }
    const task = await createTask(req.userId!, parsed.data);
    res.status(201).json(task);
  });

  router.patch('/:id', async (req: AuthedRequest, res) => {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid task update' });
      return;
    }
    const task = await updateTask(req.userId!, req.params.id, parsed.data);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(200).json(task);
  });

  router.delete('/:id', async (req: AuthedRequest, res) => {
    const deleted = await deleteTask(req.userId!, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(204).send();
  });

  router.post('/:id/toggle', async (req: AuthedRequest, res) => {
    const task = await toggleTaskComplete(req.userId!, req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(200).json(task);
  });

  return router;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- test/integration/tasks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/tasks.ts backend/test/integration/tasks.test.ts
git commit -m "Add task CRUD and toggle HTTP endpoints with per-user isolation"
```

---

## Task 15: Wire the full server + end-to-end flow

**Files:**
- Modify: `backend/src/server.ts`
- Create: `backend/docs/manual-testing.http`
- Test: `backend/test/integration/e2e.test.ts`

**Interfaces:**
- Consumes: `ResendEmailSender` (Task 6); `createAuthRouter` (Tasks 10–12); `createTasksRouter` (Task 14).
- Produces: `createServer(emailSender?: EmailSender): express.Express` — the complete, deployable app.

- [ ] **Step 1: Write the failing test**

`backend/test/integration/e2e.test.ts`:

```ts
import request from 'supertest';
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createServer } from '../../src/server';
import { FakeEmailSender } from '../fakes/fakeEmailSender';

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('end-to-end flow', () => {
  it('supports register -> verify -> login -> task CRUD -> refresh -> logout -> reset password', async () => {
    const emailSender = new FakeEmailSender();
    const app = createServer(emailSender);

    await request(app)
      .post('/auth/register')
      .send({ email: 'e2e@example.com', password: 'longenoughpassword' })
      .expect(200);

    const verifyToken = emailSender.sent[0].html.match(/token=([a-f0-9]+)/)![1];
    await request(app).post('/auth/verify-email').send({ token: verifyToken }).expect(200);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'e2e@example.com', password: 'longenoughpassword' })
      .expect(200);
    const authHeader = `Bearer ${login.body.accessToken}`;

    const task = await request(app)
      .post('/tasks')
      .set('Authorization', authHeader)
      .send({ title: 'Ship phase 1', priority: 'high' })
      .expect(201);

    await request(app)
      .post(`/tasks/${task.body.id}/toggle`)
      .set('Authorization', authHeader)
      .expect(200);

    const refreshed = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(app)
      .post('/auth/logout')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(200);

    await request(app).post('/auth/forgot-password').send({ email: 'e2e@example.com' }).expect(200);
    const resetToken = emailSender.sent[1].html.match(/token=([a-f0-9]+)/)![1];

    await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'brandnewpassword' })
      .expect(200);

    await request(app)
      .post('/auth/login')
      .send({ email: 'e2e@example.com', password: 'brandnewpassword' })
      .expect(200);
  });

  it('rejects unknown routes with a 404', async () => {
    const app = createServer(new FakeEmailSender());
    await request(app).get('/does-not-exist').expect(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- test/integration/e2e.test.ts`
Expected: FAIL — `/auth/register` returns 404 (not mounted in `createServer` yet).

- [ ] **Step 3: Wire the routers into the server**

Modify `backend/src/server.ts` to its final form:

```ts
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './env';
import type { EmailSender } from './email/sender';
import { ResendEmailSender } from './email/resendSender';
import { createAuthRouter } from './routes/auth';
import { createTasksRouter } from './routes/tasks';

export function createServer(emailSender: EmailSender = new ResendEmailSender()) {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',')
        .map(o => o.trim())
        .filter(Boolean),
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/auth', createAuthRouter(emailSender));
  app.use('/tasks', createTasksRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
}

if (require.main === module) {
  const app = createServer();
  app.listen(env.PORT, () => {
    console.log(`Backend listening on port ${env.PORT}`);
  });
}
```

- [ ] **Step 4: Add the manual testing script**

`backend/docs/manual-testing.http`:

```
### Register
POST http://localhost:4000/auth/register
Content-Type: application/json

{
  "email": "you@example.com",
  "password": "a-long-enough-password"
}

### Verify email (replace TOKEN with the value logged/emailed by register)
POST http://localhost:4000/auth/verify-email
Content-Type: application/json

{
  "token": "TOKEN"
}

### Login
POST http://localhost:4000/auth/login
Content-Type: application/json

{
  "email": "you@example.com",
  "password": "a-long-enough-password"
}

### List tasks (replace TOKEN with the accessToken from login)
GET http://localhost:4000/tasks
Authorization: Bearer TOKEN

### Create a task
POST http://localhost:4000/tasks
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "title": "Buy milk",
  "priority": "medium",
  "dueDate": "2026-10-01"
}

### Toggle a task complete (replace TASK_ID)
POST http://localhost:4000/tasks/TASK_ID/toggle
Authorization: Bearer TOKEN

### Forgot password
POST http://localhost:4000/auth/forgot-password
Content-Type: application/json

{
  "email": "you@example.com"
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- test/integration/e2e.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full test suite**

Run: `cd backend && npm test`
Expected: PASS — every unit and integration test in the plan passes together.

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.ts backend/docs/manual-testing.http backend/test/integration/e2e.test.ts
git commit -m "Wire auth and task routers into the server; add end-to-end flow test"
```
