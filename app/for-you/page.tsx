import Navbar from '@/components/Navbar';
import ForYouContent from './ForYouContent';

export const metadata = { title: 'For you · Thrifthound' };

export default function ForYouPage() {
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
