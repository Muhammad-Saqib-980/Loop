import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';

describe('runMigrations', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('applies migrations and is idempotent', async () => {
    const first = await runMigrations(pool);
    expect(first).toContain('001_init.sql');

    const second = await runMigrations(pool);
    expect(second).toEqual([]);

    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'`,
    );
    const columns = rows.map(r => r.column_name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'title',
        'priority',
        'due_date',
        'completed',
        'recurrence',
        'history',
      ]),
    );
  });
});
