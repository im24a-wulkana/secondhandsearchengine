'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bookmark, Heart, LogOut, Menu, Search, Sparkles, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useSession } from './SessionProvider';

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, signOut } = useSession();

  // Marks the current section so the nav shows where you are.
  const navLink = (href: string, label: string, icon: React.ReactNode) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`btn btn-ghost ${active ? '!text-[var(--accent)]' : ''}`}
      >
        {icon}
        {label}
      </Link>
    );
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
    router.refresh();
  };

  // Browse links are always shown — the pages themselves explain what needs an
  // account, which is friendlier than hiding the features entirely.
  const browse = (
    <>
      {navLink('/search', 'Search', <Search size={16} />)}
      {navLink('/for-you', 'For you', <Sparkles size={16} />)}
      {navLink('/saved-searches', 'Searches', <Bookmark size={16} />)}
      {navLink('/favorites', 'Saved', <Heart size={16} />)}
    </>
  );

  // Only the account controls wait for the session check, so the nav never
  // flashes "Sign in" at someone who is already signed in.
  const links = (
    <>
      {browse}
      {!isLoading &&
        (user ? (
          <button type="button" onClick={handleSignOut} className="btn btn-ghost">
            <LogOut size={16} />
            Sign out
          </button>
        ) : (
          <>
            <Link href="/login" className="btn btn-ghost">
              Sign in
            </Link>
            <Link href="/register" className="btn btn-primary">
              Create account
            </Link>
          </>
        ))}
    </>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hairline)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
      <nav className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-[var(--text)]"
        >
          One<span className="text-[var(--accent)]">Rail</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links}
          <div className="ml-1 border-l border-[var(--hairline)] pl-1">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="btn btn-ghost !p-2"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div
          id="mobile-nav"
          className="flex flex-col items-stretch gap-1 border-t border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          {links}
        </div>
      )}
    </header>
  );
}
