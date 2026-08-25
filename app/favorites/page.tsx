import Link from 'next/link';
import { Heart } from 'lucide-react';
import Navbar from '@/components/Navbar';
import FavoritesContent from './FavoritesContent';
import { getSessionUser } from '@/lib/auth';

export const metadata = { title: 'Saved · OneRail' };

export default async function FavoritesPage() {
  // Checked server-side so signed-in visitors never see a "Sign in" prompt,
  // and signed-out ones never see an empty grid that can't be populated.
  const user = await getSessionUser();

  return (
    <>
      <Navbar />
      <main id="main" className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl">Saved listings</h1>

        {user ? (
          <div className="mt-8">
            <FavoritesContent />
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
            <Heart size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
            <p className="font-display text-lg">Sign in to save listings</p>
            <p className="max-w-sm text-sm text-[var(--text-muted)]">
              Create a free account to keep listings across every marketplace in one place.
            </p>
            <div className="mt-2 flex gap-2">
              <Link href="/register" className="btn btn-primary">
                Create account
              </Link>
              <Link href="/login" className="btn btn-secondary">
                Sign in
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
