import Link from 'next/link';
import { Heart } from 'lucide-react';
import Navbar from '@/components/Navbar';

export const metadata = { title: 'Saved · Onerail' };

export default function FavoritesPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl">Saved listings</h1>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
          <Heart size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
          <p className="font-display text-lg">Nothing saved yet</p>
          <p className="max-w-sm text-sm text-[var(--text-muted)]">
            Sign in and tap the heart on any listing to keep it here.
          </p>
          <div className="mt-2 flex gap-2">
            <Link href="/login" className="btn btn-primary">
              Sign in
            </Link>
            <Link href="/search" className="btn btn-secondary">
              Browse listings
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
