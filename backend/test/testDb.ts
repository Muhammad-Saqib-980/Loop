import { pool } from '../src/db/client';

export async function truncateAll(): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE tasks, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
}
