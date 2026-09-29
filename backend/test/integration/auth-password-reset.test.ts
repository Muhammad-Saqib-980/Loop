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
