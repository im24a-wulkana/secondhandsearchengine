'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export default function AuthForm({ mode }: AuthFormProps) {
  const isRegister = mode === 'register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (isRegister) {
      if (password !== confirm) {
        setError('Those passwords don’t match.');
        return;
      }
      if (password.length < 8) {
        setError('Use at least 8 characters for your password.');
        return;
      }
    }

    setIsSubmitting(true);
    // Auth is not wired up yet — say so plainly instead of failing silently.
    setNotice(
      'Accounts aren’t connected yet. Add your Supabase keys to .env.local to enable sign-in.',
    );
    setIsSubmitting(false);
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl">
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {isRegister
            ? 'Save listings and searches across every marketplace.'
            : 'Sign in to reach your saved listings.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-wash)] px-3.5 py-2.5 text-sm text-[var(--danger)]"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mb-5 rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-muted)]"
        >
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={isSubmitting}
          required
        />

        <Field
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          disabled={isSubmitting}
          required
          hint={isRegister ? 'At least 8 characters.' : undefined}
        />

        {isRegister && (
          <Field
            id="confirm"
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={isSubmitting}
            required
          />
        )}

        <button type="submit" className="btn btn-primary mt-1 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Working…' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        {isRegister ? 'Already have an account? ' : 'New here? '}
        <Link
          href={isRegister ? '/login' : '/register'}
          className="font-medium text-[var(--accent)] hover:underline"
        >
          {isRegister ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  required,
  hint,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[var(--text)]">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="field"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-[var(--text-faint)]">
          {hint}
        </p>
      )}
    </div>
  );
}
