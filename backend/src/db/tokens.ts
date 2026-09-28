import { pool } from './client';

interface TokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

function mapTokenRow(row: any): TokenRow {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

// Email verification tokens

export async function createEmailVerificationToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [userId, tokenHash, expiresAt],
  );
  return rows[0].id;
}

export async function findValidEmailVerificationToken(
  tokenHash: string,
): Promise<TokenRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM email_verification_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? mapTokenRow(rows[0]) : null;
}

export async function markEmailVerificationTokenUsed(id: string): Promise<void> {
  await pool.query(
    `UPDATE email_verification_tokens SET used_at = now() WHERE id = $1`,
    [id],
  );
}

// Password reset tokens

export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [userId, tokenHash, expiresAt],
  );
  return rows[0].id;
}

export async function findValidPasswordResetToken(
  tokenHash: string,
): Promise<TokenRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? mapTokenRow(rows[0]) : null;
}

export async function markPasswordResetTokenUsed(id: string): Promise<void> {
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`,
    [id],
  );
}

// Refresh tokens

export interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
}

function mapRefreshRow(row: any): RefreshTokenRow {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    replacedBy: row.replaced_by,
  };
}

export async function createRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [userId, tokenHash, expiresAt],
  );
  return rows[0].id;
}

export async function findRefreshTokenByHash(
  tokenHash: string,
): Promise<RefreshTokenRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  return rows[0] ? mapRefreshRow(rows[0]) : null;
}

export async function revokeRefreshToken(
  id: string,
  replacedById?: string,
): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
    [id, replacedById ?? null],
  );
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}
