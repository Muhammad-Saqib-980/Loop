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
