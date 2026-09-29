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

  it('returns 404 (not a crash) for a PATCH with a malformed task id', async () => {
    const app = buildApp();
    const { header } = await authHeaderFor('malformed-id@example.com');

    // Before the UUID-shape guard was added, this reached findTaskForUser
    // and Postgres threw a 22P02 "invalid input syntax for type uuid" error
    // that nothing caught, crashing the process. It must now be a plain 404.
    await request(app)
      .patch('/tasks/not-a-uuid')
      .set('Authorization', header)
      .send({ title: 'Hijacked' })
      .expect(404);
  });

  it('rejects a task with an invalid dueDate instead of crashing the DB insert', async () => {
    const app = buildApp();
    const { header } = await authHeaderFor('bad-date@example.com');

    await request(app)
      .post('/tasks')
      .set('Authorization', header)
      .send({ title: 'Bad date', priority: 'medium', dueDate: 'not-a-date' })
      .expect(400);
  });

  it('clears a task due date via PATCH with dueDate: null', async () => {
    const app = buildApp();
    const { header } = await authHeaderFor('clear-due-date@example.com');

    const created = await request(app)
      .post('/tasks')
      .set('Authorization', header)
      .send({ title: 'Has a due date', priority: 'medium', dueDate: '2030-01-01' })
      .expect(201);
    expect(created.body.dueDate).toBe('2030-01-01');

    const cleared = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', header)
      .send({ dueDate: null })
      .expect(200);
    expect(cleared.body.dueDate).toBeNull();
  });
});
