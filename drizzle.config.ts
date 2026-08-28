import { defineConfig } from 'drizzle-kit';

// Use the unpooled URL for migrations — the pooled (-pooler) endpoint
// silently swallows DDL (ALTER TABLE etc.), causing migrations to fail.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
});
