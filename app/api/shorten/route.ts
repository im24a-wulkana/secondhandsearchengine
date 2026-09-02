import { NextResponse } from 'next/server';

/**
 * Proxies share links through a self-hosted URL shortener.
 *
 * The call is made here rather than from the browser because the shortener
 * restricts CORS to an allow-list of origins — going server-to-server sidesteps
 * that entirely, so its operator needs no configuration change, and its address
 * stays out of the page source.
 *
 * Contract (Spring Boot, POST /api/v1/shorten, public):
 *   request  { "originalUrl": "https://…" }
 *   response 201 { shortCode, shortUrl, originalUrl, clickCount, disabled }
 *
 * With SHORTENER_API_URL unset the endpoint reports itself unconfigured and the
 * client keeps using full links, so sharing works either way.
 */

/** The shortener stores `original_url` in a varchar(2048). */
const MAX_URL_LENGTH = 2048;
/** Copying must stay responsive; a slow shortener falls back to the long link. */
const TIMEOUT = 4000;

export async function POST(request: Request) {
  const base = process.env.SHORTENER_API_URL?.trim().replace(/\/+$/, '');
  if (!base) {
    return NextResponse.json({ success: false, reason: 'not-configured' }, { status: 200 });
  }

  let url: string;
  try {
    const body = await request.json();
    url = typeof body?.url === 'string' ? body.url.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Only ever shorten links back to this site: an open proxy would let anyone
  // launder arbitrary URLs through the shortener.
  const origin = new URL(request.url).origin;
  if (!url.startsWith(`${origin}/l#`)) {
    return NextResponse.json({ error: 'Only OneRail listing links can be shortened.' }, { status: 400 });
  }

  if (url.length > MAX_URL_LENGTH) {
    return NextResponse.json({ success: false, reason: 'too-long' }, { status: 200 });
  }

  try {
    const response = await fetch(`${base}/api/v1/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalUrl: url }),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, reason: 'upstream-error' }, { status: 200 });
    }

    const data = await response.json();
    const short = typeof data?.shortUrl === 'string' ? data.shortUrl : null;
    if (!short || !/^https?:\/\//i.test(short)) {
      return NextResponse.json({ success: false, reason: 'bad-response' }, { status: 200 });
    }

    // The shortener builds this from the forwarded request and hands back an
    // http:// address. Its host redirects to https anyway, so upgrade here to
    // save the extra hop and avoid sharing a link browsers flag as insecure.
    const secure = short.replace(/^http:\/\//i, 'https://');

    return NextResponse.json({ success: true, shortUrl: secure });
  } catch {
    // Timeout, DNS failure, connection refused — all non-fatal.
    return NextResponse.json({ success: false, reason: 'unreachable' }, { status: 200 });
  }
}
