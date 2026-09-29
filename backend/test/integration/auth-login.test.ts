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
