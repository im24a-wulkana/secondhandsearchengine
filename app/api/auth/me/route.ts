import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

/** Lets client components learn who is signed in without prop drilling. */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}
