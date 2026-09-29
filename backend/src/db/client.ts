import { Pool, types } from 'pg';
import { env } from '../env';

// Postgres DATE columns (OID 1082) have no timezone; parsing them into a JS
// Date and back can shift by a day depending on the host's local timezone.
// Keep them as the raw 'YYYY-MM-DD' string instead.
types.setTypeParser(1082, val => val);

export const pool = new Pool({ connectionString: env.DATABASE_URL });

// An idle client in the pool can be dropped by the database (e.g. a network
// blip or server-side timeout) and emits an 'error' event on the pool. With
// no listener, that becomes an unhandled 'error' event and crashes the
// process. Log it instead so the pool can keep serving other connections.
pool.on('error', err => {
  console.error('Unexpected Postgres pool error', err);
});
