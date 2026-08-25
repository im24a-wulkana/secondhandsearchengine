import { neon } from '@neondatabase/serverless';

/**
 * Neon Postgres over HTTP — no connection pooling to manage, which is what
 * makes it work on Vercel's serverless functions.
 *
 * The client is created lazily so a missing DATABASE_URL degrades to "features
 * off" rather than crashing every route that imports this file at build time.
 */
export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

type SqlClient = ReturnType<typeof neon>;
let client: SqlClient | null = null;

export function getSql(): SqlClient | null {
  if (!isDatabaseConfigured) return null;
  if (!client) client = neon(process.env.DATABASE_URL!);
  return client;
}
