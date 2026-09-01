import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SavedSearchesContent from './SavedSearchesContent';
import { getSessionUser } from '@/lib/auth';

export const metadata = { title: 'Saved searches · OneRail' };

export default async function SavedSearchesPage() {
  // Gated server-side, matching the other members-only pages.
  const user = await getSessionUser();

  return (
    <>
      <Navbar />
      <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl">Saved searches</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Keep an eye on a query and see what has appeared since you last looked.
        </p>

        {user ? (
          <div className="mt-8">
            <SavedSearchesContent />
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
            <Bookmark size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
            <p className="font-display text-lg">Sign in to save searches</p>
            <p className="max-w-sm text-sm text-[var(--text-muted)]">
              Create a free account to pin the searches you care about and track new listings.
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
