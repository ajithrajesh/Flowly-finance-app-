import React, { useState } from 'react';
import * as api from '../api';

const DESK_ITEMS = [
  { title: 'KYC verification', note: 'Review documents and OCR results' },
  { title: 'Video KYC', note: 'Join scheduled customer calls' },
  { title: 'Cash desk', note: 'Record deposits and withdrawals' },
  { title: 'Loans and FDs', note: 'Process applications and schemes' },
];

function EyeIcon({ off }) {
  return (
    <svg
      className="size-[18px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function Brand({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="flex size-[38px] items-center justify-center rounded-[10px] bg-white font-heading text-[20px] font-extrabold text-brand">
        F
      </span>
      <span className="font-heading text-[19px] font-semibold tracking-[0.01em]">Flowly Staff</span>
    </div>
  );
}

const inputClass =
  'h-12 w-full rounded-[10px] border-[1.5px] border-line bg-white px-3.5 text-[15px] text-ink transition-colors placeholder:text-subtle hover:border-[#cfc9d6] focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none';

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your work email and password.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const worker = await api.loginWorker({ email: email.trim(), password });
      onLoggedIn(worker);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const checkCaps = (e) => setCapsOn(Boolean(e.getModifierState && e.getModifierState('CapsLock')));

  return (
    <div className="grid min-h-screen bg-surface font-body text-ink min-[881px]:grid-cols-[5fr_6fr]">
      {/* Left: the desk ledger (hidden on small screens) */}
      <aside
        aria-hidden="true"
        className="relative hidden flex-col justify-between overflow-hidden bg-plum px-13 py-11 text-[#efe9f5] min-[881px]:flex"
      >
        {/* passbook ruling */}
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_35px,rgba(255,255,255,0.055)_35px,rgba(255,255,255,0.055)_36px)]" />
        <div className="absolute inset-y-0 left-12 w-px bg-accent/35" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent from-55% to-plum-deep" />

        <Brand className="relative" />

        <div className="relative pl-7">
          <h2 className="mb-10 max-w-[14ch] font-heading text-[clamp(32px,3.4vw,46px)] leading-[1.08] font-bold tracking-[-0.02em] text-white">
            Everything on your desk, in one place.
          </h2>
          <ul className="max-w-[380px]">
            {DESK_ITEMS.map((item) => (
              <li
                key={item.title}
                className="grid gap-0.5 border-t border-white/15 py-3.5 last:border-b"
              >
                <span className="font-heading text-[17px] font-semibold text-white">{item.title}</span>
                <span className="text-[13.5px] text-[#efe9f5]/70">{item.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative pl-7 text-[12.5px] text-[#efe9f5]/50">Flowly Finance · Branch operations</p>
      </aside>

      {/* Right: the form */}
      <main className="grid place-items-center px-6 py-10 max-[880px]:place-items-start max-[880px]:pt-14">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex items-center gap-3 min-[881px]:hidden">
            <span className="flex size-[38px] items-center justify-center rounded-[10px] bg-brand font-heading text-[20px] font-extrabold text-white">
              F
            </span>
            <span className="font-heading text-[19px] font-semibold">Flowly Staff</span>
          </div>

          <h1 className="mb-1.5 font-heading text-[32px] leading-[1.15] font-bold tracking-[-0.02em]">
            Sign in to your desk
          </h1>
          <p className="mb-7 text-[15px] text-muted">For workers and admins only.</p>

          {error && (
            <div
              role="alert"
              className="mb-4.5 rounded-md border-l-[3px] border-danger bg-danger-light px-3.5 py-2.5 text-sm leading-snug text-danger"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4.5">
              <label htmlFor="lg-email" className="mb-1.5 block text-sm font-semibold">
                Work email
              </label>
              <input
                id="lg-email"
                className={inputClass}
                type="email"
                autoComplete="username"
                placeholder="you@flowlyfinance.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            <div className="mb-4.5">
              <label htmlFor="lg-password" className="mb-1.5 block text-sm font-semibold">
                Password
              </label>
              <div className="relative">
                <input
                  id="lg-password"
                  className={`${inputClass} pr-12`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={checkCaps}
                  onKeyDown={checkCaps}
                  onBlur={() => setCapsOn(false)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute top-0 right-0 grid size-12 place-items-center rounded-[10px] text-muted hover:text-brand focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
              {capsOn && <p className="mt-1.5 text-[13px] text-[#8a5a00]">Caps Lock is on.</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1.5 flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] bg-brand font-heading text-base font-semibold tracking-[0.01em] text-white transition-colors hover:enabled:bg-[#4b1166] active:enabled:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-75"
            >
              {submitting && (
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              )}
              {submitting ? 'Signing in' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6.5 text-[13px] leading-normal text-muted">
            Staff accounts are created by an admin. If you don&apos;t have credentials yet, contact your branch admin.
          </p>
        </div>
      </main>
    </div>
  );
}