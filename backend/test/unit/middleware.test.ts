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
