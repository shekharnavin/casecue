import { useCallback, useEffect, useState } from 'react';

import { fetchAuthStatus, logout as apiLogout } from './lib/api.js';
import { clearAuthToken, getAuthToken } from './lib/auth.js';
import CasesPage from './pages/Cases.jsx';
import LoginPage from './pages/Login.jsx';
import RecipientsPage from './pages/Recipients.jsx';
import SettingsPage from './pages/Settings.jsx';

const NAV_ITEMS = [
  { id: 'cases', label: 'Cases' },
  { id: 'recipients', label: 'Recipients' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [activePage, setActivePage] = useState('cases');
  const [authState, setAuthState] = useState({
    authenticated: false,
    bootstrapping: true,
    defaultAdminPasswordInUse: false,
    loginRequired: false,
    user: null,
  });

  const refreshAuth = useCallback(async () => {
    try {
      const status = await fetchAuthStatus();
      setAuthState({
        authenticated: status.authenticated,
        bootstrapping: false,
        defaultAdminPasswordInUse: Boolean(status.defaultAdminPasswordInUse),
        loginRequired: status.loginRequired,
        user: status.user || null,
      });
    } catch (statusError) {
      setAuthState({
        authenticated: false,
        bootstrapping: false,
        defaultAdminPasswordInUse: false,
        error: statusError.message,
        loginRequired: true,
        user: null,
      });
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const handleAuthenticated = useCallback(
    (user) => {
      setAuthState((previous) => ({
        ...previous,
        authenticated: true,
        bootstrapping: false,
        loginRequired: true,
        user,
      }));
      refreshAuth();
    },
    [refreshAuth],
  );

  const handleLogout = useCallback(async () => {
    try {
      if (getAuthToken()) {
        await apiLogout();
      }
    } catch {
      /* ignore network errors on logout */
    } finally {
      clearAuthToken();
      await refreshAuth();
    }
  }, [refreshAuth]);

  if (authState.bootstrapping) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (authState.loginRequired && !authState.authenticated) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  const isAdmin = authState.user && authState.user.role === 'admin';

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-900 text-sm font-bold text-white">
              CC
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-900">CaseCue</h1>
              <p className="text-xs leading-tight text-slate-500">
                Unattended case hearing monitor
              </p>
            </div>
          </div>
          <nav className="ml-6 flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = item.id === activePage;
              return (
                <button
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-brand-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            {authState.user ? (
              <>
                <span className="hidden sm:inline">
                  Signed in as <strong className="text-slate-700">{authState.user.name}</strong>
                </span>
                {isAdmin ? (
                  <span className="inline-flex rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    Admin
                  </span>
                ) : null}
                <button
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  onClick={handleLogout}
                  type="button"
                >
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {isAdmin && authState.defaultAdminPasswordInUse ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3 text-sm text-amber-800">
            <span>
              <strong>Default admin password is still in use.</strong> Change it from Settings → Change my password right away.
            </span>
            <button
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              onClick={() => setActivePage('settings')}
              type="button"
            >
              Go to Settings
            </button>
          </div>
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          {activePage === 'cases' && <CasesPage currentUser={authState.user} />}
          {activePage === 'recipients' && (
            <RecipientsPage currentUser={authState.user} />
          )}
          {activePage === 'settings' && (
            <SettingsPage currentUser={authState.user} onPasswordChanged={refreshAuth} />
          )}
        </div>
      </main>
    </div>
  );
}
