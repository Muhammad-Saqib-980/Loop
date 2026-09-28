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
