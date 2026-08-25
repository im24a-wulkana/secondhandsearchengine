import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';
import ForYouContent from './ForYouContent';
import { getSessionUser } from '@/lib/auth';

export const metadata = { title: 'For you · OneRail' };

export default async function ForYouPage() {
  // Gated server-side: the page never renders for signed-out visitors, so
  // hiding the nav link alone isn't the only thing standing in the way.
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <Navbar />
        <main id="main" className="mx-auto max-w-md px-4 py-24 text-center">
          <Sparkles size={30} className="mx-auto text-[var(--text-faint)]" strokeWidth={1.5} />
          <h1 className="mt-4 font-display text-2xl">For you is for members</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Create a free account to get listings picked from what you search for.
          </p>
          <div className="mt-7 flex justify-center gap-2">
            <Link href="/register" className="btn btn-primary">
              Create account
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Sign in
            </Link>
          </div>
        </main>
      </>
    );
  }

  return renderFeed();
}

function renderFeed() {
  return (
    <>
      <Navbar />
      <main id="main" className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-3xl">For you</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Listings picked from what you’ve been searching for.
          </p>
        </div>
        <ForYouContent />
      </main>
    </>
  );
}
