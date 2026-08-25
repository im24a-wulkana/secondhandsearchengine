import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { getSql } from './db';

/**
 * Email + password auth backed by Neon.
 *
 * Sessions are stateless signed JWTs in an httpOnly cookie, so verifying one
 * costs no database round trip. Signing out clears the cookie; there's no
 * server-side session table to keep in sync.
 */
const COOKIE_NAME = 'onerail_session';
const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 12;

export type SessionUser = { id: string; email: string };

function getSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  // A short secret is worse than none: fail closed rather than sign weakly.
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

export const isAuthConfigured = Boolean(process.env.DATABASE_URL && getSecret());

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET is not configured');

  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Returns the signed-in user, or null. Never throws. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const secret = getSecret();
  if (!secret) return null;

  try {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || typeof payload.email !== 'string') return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    // Expired, tampered with, or malformed — treat as signed out.
    return null;
  }
}

export type AuthResult = { ok: true; user: SessionUser } | { ok: false; error: string };

export async function registerUser(email: string, password: string): Promise<AuthResult> {
  const sql = getSql();
  if (!sql) return { ok: false, error: 'Accounts are not configured on this deployment.' };

  const normalized = email.trim().toLowerCase();
  const rows = (await sql`
    insert into users (email, password_hash)
    values (${normalized}, ${await hashPassword(password)})
    on conflict do nothing
    returning id, email
  `) as { id: string; email: string }[];

  // `on conflict do nothing` returns no rows when the email is taken.
  if (rows.length === 0) {
    return { ok: false, error: 'An account with that email already exists.' };
  }
  return { ok: true, user: { id: rows[0].id, email: rows[0].email } };
}

export async function authenticateUser(email: string, password: string): Promise<AuthResult> {
  const sql = getSql();
  if (!sql) return { ok: false, error: 'Accounts are not configured on this deployment.' };

  const normalized = email.trim().toLowerCase();
  const rows = (await sql`
    select id, email, password_hash from users where lower(email) = ${normalized} limit 1
  `) as { id: string; email: string; password_hash: string }[];

  // Same message either way, so this can't be used to enumerate accounts.
  const invalid = { ok: false as const, error: 'That email or password is incorrect.' };
  if (rows.length === 0) {
    // Burn comparable time so a missing user isn't detectably faster.
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    return invalid;
  }

  const valid = await verifyPassword(password, rows[0].password_hash);
  if (!valid) return invalid;

  return { ok: true, user: { id: rows[0].id, email: rows[0].email } };
}
