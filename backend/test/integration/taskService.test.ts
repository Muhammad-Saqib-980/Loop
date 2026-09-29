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
