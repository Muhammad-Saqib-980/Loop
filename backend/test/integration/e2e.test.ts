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
