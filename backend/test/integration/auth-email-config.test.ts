import express from 'express';
import request from 'supertest';
import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createAuthRouter, type AuthRouterOptions } from '../../src/routes/auth';
import { FakeEmailSender } from '../fakes/fakeEmailSender';

function buildApp(options: AuthRouterOptions) {
  const emailSender = new FakeEmailSender();
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(emailSender, options));
  return { app, emailSender };
}

const credentials = { email: 'user@example.com', password: 'longenoughpassword' };

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /auth/config', () => {
  it('reports the configured email flags', async () => {
    const { app } = buildApp({ emailVerificationRequired: false, emailEnabled: true });
    const res = await request(app).get('/auth/config').expect(200);
    expect(res.body).toEqual({ emailVerificationRequired: false, emailEnabled: true });
  });
});

describe('verification required (default behaviour)', () => {
  it('register reports that a verification email was sent', async () => {
    const { app, emailSender } = buildApp({ emailVerificationRequired: true, emailEnabled: true });
    const res = await request(app).post('/auth/register').send(credentials).expect(200);
    expect(res.body).toMatchObject({ emailVerificationRequired: true, emailEnabled: true });
    expect(emailSender.sent).toHaveLength(1);
  });

  it('refuses to build a router that requires verification without email', () => {
    expect(() =>
      createAuthRouter(new FakeEmailSender(), {
        emailVerificationRequired: true,
        emailEnabled: false,
      }),
    ).toThrow(/REQUIRE_EMAIL_VERIFICATION/);
  });
});

describe('verification not required', () => {
  it('lets a newly registered user log in without verifying and sends no email', async () => {
    const { app, emailSender } = buildApp({ emailVerificationRequired: false, emailEnabled: true });
    const reg = await request(app).post('/auth/register').send(credentials).expect(200);
    expect(reg.body).toMatchObject({ emailVerificationRequired: false });
    expect(emailSender.sent).toHaveLength(0);

    const login = await request(app).post('/auth/login').send(credentials).expect(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
  });

  it('lets a previously unverified user log in once verification is turned off', async () => {
    const strict = buildApp({ emailVerificationRequired: true, emailEnabled: true });
    await request(strict.app).post('/auth/register').send(credentials).expect(200);
    await request(strict.app).post('/auth/login').send(credentials).expect(403);

    const relaxed = buildApp({ emailVerificationRequired: false, emailEnabled: true });
    await request(relaxed.app).post('/auth/login').send(credentials).expect(200);
  });

  it('returns the same register response for new and existing emails', async () => {
    const { app } = buildApp({ emailVerificationRequired: false, emailEnabled: false });
    const first = await request(app).post('/auth/register').send(credentials).expect(200);
    const second = await request(app).post('/auth/register').send(credentials).expect(200);
    expect(first.body).toEqual(second.body);
  });
});

describe('email disabled', () => {
  it('forgot-password returns EMAIL_DISABLED regardless of whether the account exists', async () => {
    const { app } = buildApp({ emailVerificationRequired: false, emailEnabled: false });
    await request(app).post('/auth/register').send(credentials).expect(200);

    const known = await request(app)
      .post('/auth/forgot-password')
      .send({ email: credentials.email })
      .expect(503);
    const unknown = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(503);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.code).toBe('EMAIL_DISABLED');
  });

  it('resend-verification returns EMAIL_DISABLED', async () => {
    const { app } = buildApp({ emailVerificationRequired: false, emailEnabled: false });
    const res = await request(app)
      .post('/auth/resend-verification')
      .send({ email: credentials.email })
      .expect(503);
    expect(res.body.code).toBe('EMAIL_DISABLED');
  });
});
