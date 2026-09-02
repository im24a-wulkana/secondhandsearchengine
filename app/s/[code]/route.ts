import { NextResponse } from 'next/server';

/**
 * Serves short share links from OneRail's own domain.
 *
 * The shortener stores the code and counts clicks, but its `shortUrl` carries
 * its own Railway host. Resolving here instead means a shared link reads as
 * onerail/s/X while the shortener keeps doing the bookkeeping — its
 * `GET /api/v1/resolve/{code}` is public, so this needs nothing from its
 * operator.
 *
 * The destination is always a /l# link on this site, and the fragment survives
 * because it travels in the Location header rather than depending on the
 * browser to reattach it.
 */

const TIMEOUT = 6000;
/** Base62 codes only; anything else is a probe, not a real link. */
const CODE = /^[0-9A-Za-z]{1,32}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const origin = new URL(request.url).origin;
  const base = process.env.SHORTENER_API_URL?.trim().replace(/\/+$/, '');

  const giveUp = () => NextResponse.redirect(`${origin}/l#`, 302);

  if (!base || !CODE.test(code)) return giveUp();

  try {
    const response = await fetch(`${base}/api/v1/resolve/${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    // 404 covers both an unknown code and one its owner has disabled.
    if (!response.ok) return giveUp();

    const data = await response.json();
    const target = typeof data?.originalUrl === 'string' ? data.originalUrl : '';

    // Only ever bounce to this site's own listing pages: the shortener is a
    // public endpoint, so anyone can mint a code pointing anywhere, and an
    // unchecked redirect here would make OneRail an open redirector.
    let destination: URL;
    try {
      destination = new URL(target);
    } catch {
      return giveUp();
    }
    if (destination.pathname !== '/l' || !destination.hash) return giveUp();

    // Rebuilt on the current origin rather than trusting the stored host, so a
    // link minted on localhost or a preview deploy still opens here — and a
    // code pointing at someone else's domain cannot redirect off-site.
    return NextResponse.redirect(`${origin}/l${destination.hash}`, 302);
  } catch {
    return giveUp();
  }
}
