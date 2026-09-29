import { pool } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { truncateAll } from '../testDb';
import {
  createUser,
  findUserByEmail,
  findUserById,
  markEmailVerified,
  updatePasswordHash,
} from '../../src/db/users';

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe('user queries', () => {
  it('creates and finds a user by email and id, lowercasing the email', async () => {
    const user = await createUser('Test@Example.com', 'hashed');
    expect(user.email).toBe('test@example.com');
    expect(user.emailVerified).toBe(false);

    const byEmail = await findUserByEmail('test@example.com');
    expect(byEmail?.id).toBe(user.id);

    const byId = await findUserById(user.id);
    expect(byId?.email).toBe('test@example.com');
  });

  it('returns the existing user for a duplicate email instead of overwriting it', async () => {
    // createUser uses INSERT ... ON CONFLICT (email) DO NOTHING so that a
    // race between a pre-insert existence check and the insert itself
    // (e.g. two concurrent /register calls) resolves to the original user
    // rather than throwing or overwriting the original password hash.
    const original = await createUser('dupe@example.com', 'hashed');
    const result = await createUser('dupe@example.com', 'other-hash');

    expect(result.id).toBe(original.id);
    const byEmail = await findUserByEmail('dupe@example.com');
    expect(byEmail?.passwordHash).toBe('hashed');
  });

  it('marks email verified', async () => {
    const user = await createUser('verify@example.com', 'hashed');
    await markEmailVerified(user.id);
    const updated = await findUserById(user.id);
    expect(updated?.emailVerified).toBe(true);
  });

  it('updates the password hash', async () => {
    const user = await createUser('pw@example.com', 'hashed');
    await updatePasswordHash(user.id, 'new-hash');
    const updated = await findUserById(user.id);
    expect(updated?.passwordHash).toBe('new-hash');
  });
});
