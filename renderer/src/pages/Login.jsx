import { useEffect, useState } from 'react';

import { fetchAuthStatus, login as apiLogin } from '../lib/api.js';
import { setAuthToken } from '../lib/auth.js';
import { SUPPORT_CONTACT } from '../lib/support.js';

export default function LoginPage({ onAuthenticated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDefaultHint, setShowDefaultHint] = useState(false);

  useEffect(() => {
    fetchAuthStatus()
      .then((status) => setShowDefaultHint(Boolean(status.defaultAdminPasswordInUse)))
      .catch(() => setShowDefaultHint(false));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your email or phone and password.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const result = await apiLogin(username.trim(), password);
      setAuthToken(result.token);
      setPassword('');
      onAuthenticated(result.user);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-900 text-sm font-bold text-white">
            CC
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">CaseCue</h1>
            <p className="text-xs text-slate-500">Sign in to continue</p>
          </div>
        </div>

        {showDefaultHint ? (
          <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>First time?</strong> Sign in as <code className="rounded bg-amber-100 px-1">admin</code> with password{' '}
            <code className="rounded bg-amber-100 px-1">password123</code>. Change it from Settings right after.
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="field-label">Email or Phone</span>
            <div className="mt-1.5">
              <input
                autoFocus
                className="input"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="name@example.com or 9999999999"
                value={username}
              />
            </div>
          </label>

          <label className="block">
            <span className="field-label">Password</span>
            <div className="mt-1.5">
              <input
                className="input"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                type="password"
                value={password}
              />
            </div>
          </label>

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <button
            className="btn-primary w-full"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
          Need help? {SUPPORT_CONTACT.name} ·{' '}
          <a className="text-brand-700 hover:underline" href={`mailto:${SUPPORT_CONTACT.email}`}>
            {SUPPORT_CONTACT.email}
          </a>{' '}
          ·{' '}
          <a className="text-brand-700 hover:underline" href={`tel:${SUPPORT_CONTACT.phone}`}>
            {SUPPORT_CONTACT.phone}
          </a>
        </div>
      </div>
    </div>
  );
}
