import { pool } from './client';

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: any): UserRow {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    emailVerified: row.email_verified,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING *`,
    [email.toLowerCase(), passwordHash],
  );
  if (rows[0]) {
    return mapRow(rows[0]);
  }
  // A concurrent request already created this email between our caller's
  // existence check and this insert. Re-fetch the existing row rather than
  // throwing - ON CONFLICT DO NOTHING already guarantees we never overwrite
  // the existing password hash.
  const existing = await findUserByEmail(email);
  if (!existing) {
    throw new Error(`createUser: conflict on ${email} but no existing row found`);
  }
  return existing;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`,
    [userId],
  );
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
    [passwordHash, userId],
  );
}
