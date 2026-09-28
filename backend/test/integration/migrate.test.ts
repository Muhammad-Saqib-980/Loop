import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';

describe('runMigrations', () => {
  beforeEach(async () => {
    // Reset database state to test migration application
    try {
      // Drop tables in reverse order of creation (respecting foreign keys)
      await pool.query(`
        DROP TABLE IF EXISTS tasks CASCADE;
        DROP TABLE IF EXISTS refresh_tokens CASCADE;
        DROP TABLE IF EXISTS password_reset_tokens CASCADE;
        DROP TABLE IF EXISTS email_verification_tokens CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        TRUNCATE TABLE schema_migrations;
      `);
    } catch {
      // Tables might not exist yet, which is fine
    }
  });

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
