import { Pool, types } from 'pg';
import { env } from '../env';

// Postgres DATE columns (OID 1082) have no timezone; parsing them into a JS
// Date and back can shift by a day depending on the host's local timezone.
// Keep them as the raw 'YYYY-MM-DD' string instead.
types.setTypeParser(1082, val => val);

export const pool = new Pool({ connectionString: env.DATABASE_URL });
