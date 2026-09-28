import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import { createUser } from '../../src/db/users';
import {
  createEmailVerificationToken,
  createPasswordResetToken,
  createRefreshToken,
  findRefreshTokenByHash,
  findValidEmailVerificationToken,
  findValidPasswordResetToken,
  markEmailVerificationTokenUsed,
  markPasswordResetTokenUsed,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
} from '../../src/db/tokens';

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

describe('email verification tokens', () => {
  it('finds a valid token and rejects it once used', async () => {
    const future = new Date(Date.now() + 60_000);
    const id = await createEmailVerificationToken(userId, 'hash-a', future);

    expect(await findValidEmailVerificationToken('hash-a')).not.toBeNull();

    await markEmailVerificationTokenUsed(id);
    expect(await findValidEmailVerificationToken('hash-a')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const past = new Date(Date.now() - 60_000);
    await createEmailVerificationToken(userId, 'hash-b', past);
    expect(await findValidEmailVerificationToken('hash-b')).toBeNull();
  });
});

describe('password reset tokens', () => {
  it('finds a valid token and rejects it once used', async () => {
    const future = new Date(Date.now() + 60_000);
    const id = await createPasswordResetToken(userId, 'hash-c', future);

    expect(await findValidPasswordResetToken('hash-c')).not.toBeNull();

    await markPasswordResetTokenUsed(id);
    expect(await findValidPasswordResetToken('hash-c')).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('finds a token by hash and revokes it', async () => {
    const future = new Date(Date.now() + 60_000);
    const id = await createRefreshToken(userId, 'hash-d', future);

    const found = await findRefreshTokenByHash('hash-d');
    expect(found?.id).toBe(id);
    expect(found?.revokedAt).toBeNull();

    await revokeRefreshToken(id);
    const revoked = await findRefreshTokenByHash('hash-d');
    expect(revoked?.revokedAt).not.toBeNull();
  });

  it('revokes every refresh token for a user', async () => {
    const future = new Date(Date.now() + 60_000);
    await createRefreshToken(userId, 'hash-e', future);
    await createRefreshToken(userId, 'hash-f', future);

    await revokeAllRefreshTokensForUser(userId);

    const first = await findRefreshTokenByHash('hash-e');
    const second = await findRefreshTokenByHash('hash-f');
    expect(first?.revokedAt).not.toBeNull();
    expect(second?.revokedAt).not.toBeNull();
  });
});
