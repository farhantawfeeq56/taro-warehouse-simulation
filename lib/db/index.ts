import type { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let _db: Awaited<ReturnType<typeof drizzle<typeof schema>>> | null = null;

/**
 * Returns a lazy-initialized Drizzle instance connected to Neon.
 * Uses dynamic import so the neon package is only loaded at runtime,
 * not at build time (avoids Vercel build failures when DATABASE_URL
 * is not available during compilation).
 */
export async function getDb() {
  if (!_db) {
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle: drizzleInit } = await import('drizzle-orm/neon-http');
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzleInit(sql, { schema });
  }
  return _db;
}
