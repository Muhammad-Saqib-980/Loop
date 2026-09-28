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
