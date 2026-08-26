import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

/**
 * eBay Marketplace Account Deletion / Closure notification endpoint.
 *
 * eBay requires this before issuing production keys. It serves two purposes:
 *
 * 1. GET  — a one-time challenge. eBay sends `?challenge_code=…` and expects
 *           SHA-256(challengeCode + verificationToken + endpointUrl) back.
 * 2. POST — the actual notification that a user deleted their eBay account.
 *
 * Docs: https://developer.ebay.com/develop/guides-v2/marketplace-user-account-deletion
 */

/**
 * Must match the URL registered in the eBay developer portal *exactly* —
 * scheme, host, and path, with no trailing slash. A mismatch produces a valid
 * hash of the wrong string, so verification fails with no useful error.
 */
function getEndpointUrl(request: Request): string {
  const configured = process.env.EBAY_DELETION_ENDPOINT;
  if (configured) return configured.replace(/\/$/, '');

  // Fall back to the request's own origin, which is right in most deployments.
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}${url.pathname}`;
}

export async function GET(request: Request) {
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  if (!token) {
    console.error('EBAY_VERIFICATION_TOKEN is not set; cannot answer eBay challenge.');
    return NextResponse.json(
      { error: 'Endpoint is not configured.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const challengeCode = searchParams.get('challenge_code');
  if (!challengeCode) {
    return NextResponse.json({ error: 'challenge_code is required.' }, { status: 400 });
  }

  // Order is fixed by eBay: challengeCode, then token, then the endpoint URL.
  const challengeResponse = createHash('sha256')
    .update(challengeCode)
    .update(token)
    .update(getEndpointUrl(request))
    .digest('hex');

  return NextResponse.json(
    { challengeResponse },
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

export async function POST(request: Request) {
  // eBay retries on non-2xx, so acknowledge first and never fail the response
  // over our own processing. There is no eBay user data stored here — accounts
  // are local to OneRail — so there is nothing to erase on receipt.
  try {
    const body = await request.json().catch(() => null);
    const userId = body?.notification?.data?.userId ?? 'unknown';
    console.info(`eBay account deletion notification received for user ${userId}`);
  } catch (error) {
    console.error('eBay deletion notification handling error:', error);
  }

  return new NextResponse(null, { status: 200 });
}
