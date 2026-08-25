import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main id="main" className="mx-auto flex max-w-md flex-col items-center px-4 py-28 text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="mt-3 font-display text-3xl">This rail is empty</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The page you were looking for isn’t here. It may have been moved or removed.
        </p>
        <Link href="/" className="btn btn-primary mt-7">
          Back to search
        </Link>
      </main>
    </>
  );
}
