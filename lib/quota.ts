import { getSql } from './db';
import { getSessionUser, type SessionUser } from './auth';

/**
 * Per-user daily limits on the endpoints that spend Anthropic credits.
 *
 * Without this the AI routes are open to anyone who finds the URL, and every
 * call bills the project owner. Owner accounts are exempt so the person paying
 * is never rate-limited by their own quota.
 */

/** Comma-separated emails, case-insensitive. Falls back to the sole owner. */
function ownerEmails(): string[] {
  const configured = process.env.AI_OWNER_EMAILS ?? 'aaron.wulkan@icloud.com';
  return configured
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwner(user: SessionUser | null): boolean {
  if (!user?.email) return false;
  return ownerEmails().includes(user.email.toLowerCase());
}

export type Feature = 'authenticate' | 'image-search';

/** Daily allowance per signed-in, non-owner account. */
const DAILY_LIMIT: Record<Feature, number> = {
  authenticate: 5,
  'image-search': 10,
};

export type QuotaResult =
  | { allowed: true; user: SessionUser | null; owner: boolean; remaining: number | null }
  | { allowed: false; status: 401 | 429 | 503; error: string };

/**
 * Checks whether the caller may use a paid feature.
 *
 * Signing in is required — an anonymous caller has no identity to meter, so
 * allowing them would leave the endpoint open to anyone with the URL.
 */
export async function checkQuota(feature: Feature): Promise<QuotaResult> {
  const sql = getSql();
  if (!sql) {
    return {
      allowed: false,
      status: 503,
      error: 'Accounts are not configured on this deployment.',
    };
  }

  const user = await getSessionUser();
  if (!user) {
    return {
      allowed: false,
      status: 401,
      error: 'Sign in to use this feature.',
    };
  }

  if (isOwner(user)) {
    return { allowed: true, user, owner: true, remaining: null };
  }

  const limit = DAILY_LIMIT[feature];

  const rows = (await sql`
    select count(*)::int as used
    from ai_usage
    where user_id = ${user.id}
      and feature = ${feature}
      and used_at > now() - interval '24 hours'
  `) as { used: number }[];

  const used = rows[0]?.used ?? 0;
  if (used >= limit) {
    return {
      allowed: false,
      status: 429,
      error: `You have used all ${limit} of today's checks. They reset 24 hours after each use.`,
    };
  }

  return { allowed: true, user, owner: false, remaining: limit - used - 1 };
}

/**
 * Records a successful call. Only non-owner usage is logged, since owner calls
 * are never metered and the rows would only grow the table.
 */
export async function recordUsage(
  feature: Feature,
  user: SessionUser | null,
  owner: boolean,
): Promise<void> {
  if (owner || !user) return;
  const sql = getSql();
  if (!sql) return;

  try {
    await sql`insert into ai_usage (user_id, feature) values (${user.id}, ${feature})`;
  } catch (error) {
    // Never fail the user's request over bookkeeping.
    console.error('AI usage logging failed:', error);
  }
}
