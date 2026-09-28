import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';

describe('runMigrations', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('applies migrations and is idempotent', async () => {
    // First call to ensure migrations are applied
    await runMigrations(pool);

    // Check that 001_init.sql is recorded as applied in schema_migrations
    const { rows: migrationRows } = await pool.query(
      `SELECT filename FROM schema_migrations WHERE filename = '001_init.sql'`,
    );
    expect(migrationRows.length).toBe(1);
    expect(migrationRows[0].filename).toBe('001_init.sql');

    // Second call should return empty array (idempotent)
    const second = await runMigrations(pool);
    expect(second).toEqual([]);

    // Check that tasks table has expected columns
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
