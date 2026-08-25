import { NextResponse } from 'next/server';
import { createSession, registerUser, isAuthConfigured } from '@/lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isAuthConfigured) {
    return NextResponse.json(
      { error: 'Accounts are not configured on this deployment.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Use at least 8 characters for your password.' },
        { status: 400 },
      );
    }

    const result = await registerUser(email, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    await createSession(result.user);
    return NextResponse.json({ success: true, user: result.user });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
