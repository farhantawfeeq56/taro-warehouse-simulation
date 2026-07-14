import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Returns a lazy-initialized Drizzle instance connected to Neon.
 * The connection is only created on first use so that builds
 * and static generation don't fail trying to reach the database.
 */
export function getDb() {
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzle(sql, { schema });
  }
  return _db;
}
