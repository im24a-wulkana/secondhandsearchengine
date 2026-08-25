'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Heart, LogOut, Menu, Sparkles, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface NavbarProps {
  isAuthenticated?: boolean;
  onLogout?: () => void;
}

export default function Navbar({ isAuthenticated = false, onLogout }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Available signed in or out — the feed runs off local search history.
  const forYou = (
    <Link href="/for-you" className="btn btn-ghost">
      <Sparkles size={16} />
      For you
    </Link>
  );

  const links = isAuthenticated ? (
    <>
      {forYou}
      <Link href="/favorites" className="btn btn-ghost">
        <Heart size={16} />
        Saved
      </Link>
      <button type="button" onClick={onLogout} className="btn btn-ghost">
        <LogOut size={16} />
        Sign out
      </button>
    </>
  ) : (
    <>
      {forYou}
      <Link href="/login" className="btn btn-ghost">
        Sign in
      </Link>
      <Link href="/register" className="btn btn-primary">
        Create account
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hairline)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
      <nav className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-[var(--text)]"
        >
          Thrift<span className="text-[var(--accent)]">hound</span>
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
