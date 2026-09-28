import { pool } from './client';
import { runMigrations } from './migrate';

runMigrations(pool)
  .then(applied => {
    if (applied.length === 0) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
    }
    return pool.end();
  })
  .catch(err => {
    console.error('Migration failed:', err);
    return pool.end().finally(() => process.exit(1));
  });
