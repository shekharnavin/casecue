import { useCallback, useEffect, useRef, useState } from 'react';

import LookupsEditor from '../components/LookupsEditor.jsx';
import {
  changePassword,
  exportBackup,
  fetchAppData,
  fetchSchedulerState,
  fetchUnsupportedRequests,
  importBackup,
  saveSmtpSettings,
  sendEmailTest,
} from '../lib/api.js';
import { SUPPORT_CONTACT } from '../lib/support.js';

const EMPTY_SMTP_FORM = { from: '', host: '', pass: '', port: '587', user: '' };

const SCHEDULE_LABELS = {
  '0 8 * * *': 'Daily 8:00 AM',
  '0 18 * * *': 'Daily 6:00 PM',
  '30 18 * * *': 'Daily 6:30 PM',
  '0 19 * * *': 'Daily 7:00 PM',
  '0 20 * * *': 'Daily 8:00 PM',
  '0 8,18 * * *': 'Twice daily — 8:00 AM and 6:00 PM',
  '0 */1 * * *': 'Every 1 hour',
  '0 */6 * * *': 'Every 6 hours',
  '*/15 * * * *': 'Every 15 minutes',
};

function describeSchedule(cron) {
  if (!cron) {
    return '';
  }
  return SCHEDULE_LABELS[cron] || cron;
}

export default function SettingsPage({ currentUser, onPasswordChanged }) {
  const [scheduler, setScheduler] = useState(null);
  const [unsupported, setUnsupported] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const [smtpForm, setSmtpForm] = useState(EMPTY_SMTP_FORM);
  const [smtpHasPass, setSmtpHasPass] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMessage, setSmtpMessage] = useState('');
  const [smtpError, setSmtpError] = useState('');
  const [logFilePath, setLogFilePath] = useState('');
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [serverVersion, setServerVersion] = useState('');
  const [serverExecPath, setServerExecPath] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState('');
  const backupInputRef = useRef(null);

  const isAdmin = currentUser && currentUser.role === 'admin';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [schedulerState, unsupportedRequests, appData] = await Promise.all([
        fetchSchedulerState(),
        fetchUnsupportedRequests(),
        fetchAppData(),
      ]);
      setScheduler(schedulerState);
      setUnsupported(unsupportedRequests.requests || []);
      const smtp = appData.smtp || {};
      setSmtpForm({
        from: smtp.from || '',
        host: smtp.host || '',
        pass: '',
        port: smtp.port ? String(smtp.port) : '587',
        user: smtp.user || '',
      });
      setSmtpHasPass(Boolean(smtp.hasPass));
      setEmailConfigured(Boolean(appData.emailConfigured));
      setLogFilePath(appData.logFilePath || '');
      setServerVersion(appData.version || '');
      setServerExecPath(appData.serverExecPath || '');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSmtpField = useCallback((field, value) => {
    setSmtpForm((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleSaveSmtp = useCallback(async () => {
    setSmtpError('');
    setSmtpMessage('');
    if (!smtpForm.host.trim() || !smtpForm.user.trim()) {
      setSmtpError('SMTP host and username are required.');
      return;
    }
    if (!smtpForm.pass && !smtpHasPass) {
      setSmtpError('Enter the SMTP password / app password.');
      return;
    }

    setSmtpSaving(true);
    try {
      const payload = {
        from: smtpForm.from.trim(),
        host: smtpForm.host.trim(),
        port: Number(smtpForm.port) || 587,
        user: smtpForm.user.trim(),
      };
      // Only send the password when the user typed a new one; blank keeps the saved one.
      if (smtpForm.pass) {
        payload.pass = smtpForm.pass;
      }
      const result = await saveSmtpSettings(payload);
      const smtp = result.smtp || {};
      setSmtpForm((previous) => ({ ...previous, pass: '' }));
      setSmtpHasPass(Boolean(smtp.hasPass));
      setSmtpMessage('Email settings saved.');
    } catch (saveError) {
      setSmtpError(saveError.message);
    } finally {
      setSmtpSaving(false);
    }
  }, [smtpForm, smtpHasPass]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDownloadBackup = useCallback(async () => {
    setBackupError('');
    setBackupMessage('');
    setBackupBusy(true);
    try {
      const result = await exportBackup();
      const { ok, ...backup } = result;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `casecue-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupMessage('Backup downloaded. Keep it safe — it contains your SMTP password and login data.');
    } catch (exportError) {
      setBackupError(exportError.message);
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const handleImportFile = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0];
    if (backupInputRef.current) {
      backupInputRef.current.value = '';
    }
    if (!file) {
      return;
    }
    const confirmed = window.confirm(
      'Restore this backup? It will REPLACE all current cases, recipients, schedules and SMTP settings.',
    );
    if (typeof window !== 'undefined' && window.casecue && window.casecue.refocus) {
      window.casecue.refocus();
    }
    if (!confirmed) {
      return;
    }

    setBackupError('');
    setBackupMessage('');
    setBackupBusy(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const result = await importBackup(backup);
      setBackupMessage(
        `Restored ${result.imported.cases} case(s) and ${result.imported.users} recipient(s). Reloading…`,
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (importError) {
      setBackupError(`Restore failed: ${importError.message}`);
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const handleSendTest = useCallback(async () => {
    setEmailMessage('');
    const to = emailTo.trim();
    if (!to) {
      setEmailMessage('Enter an email address first.');
      return;
    }
    setEmailSending(true);
    try {
      const result = await sendEmailTest(to);
      setEmailMessage(`Test email sent. Message ID: ${result.messageId}`);
    } catch (sendError) {
      setEmailMessage(`Failed: ${sendError.message}`);
    } finally {
      setEmailSending(false);
    }
  }, [emailTo]);

  const handleChangePassword = useCallback(async () => {
    setPasswordError('');
    setPasswordMessage('');
    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('New password must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setPasswordChanging(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMessage('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (onPasswordChanged) {
        onPasswordChanged();
      }
    } catch (changeError) {
      setPasswordError(changeError.message);
    } finally {
      setPasswordChanging(false);
    }
  }, [confirmPassword, currentPassword, newPassword, onPasswordChanged]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Settings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Account, scheduler status, email delivery, and unsupported portal queue.
          </p>
        </div>
        <button className="btn-secondary" disabled={loading} onClick={reload} type="button">
          {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {currentUser ? (
        <section className="section-card">
          <h3 className="section-title">Change my password</h3>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as <strong>{currentUser.name}</strong> ({currentUser.email || currentUser.loginId}).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="field-label">Current password</span>
              <div className="mt-1.5">
                <input
                  autoComplete="current-password"
                  className="input"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  value={currentPassword}
                />
              </div>
            </label>
            <label className="block">
              <span className="field-label">New password</span>
              <div className="mt-1.5">
                <input
                  autoComplete="new-password"
                  className="input"
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  value={newPassword}
                />
              </div>
            </label>
            <label className="block">
              <span className="field-label">Confirm new password</span>
              <div className="mt-1.5">
                <input
                  autoComplete="new-password"
                  className="input"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  value={confirmPassword}
                />
              </div>
            </label>
          </div>
          {passwordError ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {passwordError}
            </div>
          ) : null}
          {passwordMessage ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {passwordMessage}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <button
              className="btn-primary"
              disabled={passwordChanging}
              onClick={handleChangePassword}
              type="button"
            >
              {passwordChanging ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="section-card">
        <h3 className="section-title">Scheduler</h3>
        <p className="mt-3 text-sm text-slate-600">
          Default schedule:{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
            {scheduler?.defaultSchedule || '—'}
          </code>{' '}
          <span className="text-slate-500">— {describeSchedule(scheduler?.defaultSchedule)}</span>
        </p>
        <div className="mt-4">
          {loading ? (
            <div className="text-sm text-slate-400">Loading…</div>
          ) : !scheduler || !scheduler.jobs.length ? (
            <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
              No active scheduled jobs. Add a case (and link it to a supported portal) for it to appear here.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Case ID</th>
                    <th className="px-4 py-2 text-left">Cron</th>
                    <th className="px-4 py-2 text-left">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {scheduler.jobs.map((job) => (
                    <tr key={job.caseId}>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{job.caseId}</td>
                      <td className="px-4 py-2">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                          {job.schedule}
                        </code>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{describeSchedule(job.schedule)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {isAdmin ? (
        <section className="section-card">
          <h3 className="section-title">Email (SMTP) settings</h3>
          <p className="mt-2 text-sm text-slate-600">
            The mailbox CaseCue sends hearing updates from. For Gmail/Outlook use an{' '}
            <strong>app password</strong>, not your normal login password.
          </p>

          <div
            className={`mt-4 rounded-md border px-3 py-2.5 text-sm ${
              emailConfigured
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            <div className="font-medium">
              {emailConfigured ? '✓ Email is configured' : '⚠ Email is not configured'}
            </div>
            <dl className="mt-1.5 grid grid-cols-1 gap-0.5 text-xs sm:grid-cols-2">
              <div>
                <span className="text-slate-500">Server: </span>
                <span className="font-mono">{smtpForm.host || '—'}:{smtpForm.port || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Username: </span>
                <span className="font-mono">{smtpForm.user || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Sending from: </span>
                <span className="font-mono">{smtpForm.from || smtpForm.user || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Password: </span>
                <span>{smtpHasPass ? 'set' : 'not set'}</span>
              </div>
            </dl>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">SMTP host</span>
              <div className="mt-1.5">
                <input
                  className="input"
                  onChange={(event) => updateSmtpField('host', event.target.value)}
                  placeholder="smtp.gmail.com"
                  value={smtpForm.host}
                />
              </div>
            </label>
            <label className="block">
              <span className="field-label">Port</span>
              <div className="mt-1.5">
                <input
                  className="input"
                  onChange={(event) => updateSmtpField('port', event.target.value)}
                  placeholder="587"
                  value={smtpForm.port}
                />
              </div>
            </label>
            <label className="block">
              <span className="field-label">Username</span>
              <div className="mt-1.5">
                <input
                  autoComplete="off"
                  className="input"
                  onChange={(event) => updateSmtpField('user', event.target.value)}
                  placeholder="you@example.com"
                  value={smtpForm.user}
                />
              </div>
            </label>
            <label className="block">
              <span className="field-label">
                Password {smtpHasPass ? '(leave blank to keep saved)' : ''}
              </span>
              <div className="mt-1.5">
                <input
                  autoComplete="new-password"
                  className="input"
                  onChange={(event) => updateSmtpField('pass', event.target.value)}
                  placeholder={smtpHasPass ? '••••••••' : 'app password'}
                  type="password"
                  value={smtpForm.pass}
                />
              </div>
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">From address (optional)</span>
              <div className="mt-1.5">
                <input
                  className="input"
                  onChange={(event) => updateSmtpField('from', event.target.value)}
                  placeholder="CaseCue <you@example.com>"
                  value={smtpForm.from}
                />
              </div>
            </label>
          </div>
          {smtpError ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {smtpError}
            </div>
          ) : null}
          {smtpMessage ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {smtpMessage}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <button
              className="btn-primary"
              disabled={smtpSaving}
              onClick={handleSaveSmtp}
              type="button"
            >
              {smtpSaving ? 'Saving…' : 'Save email settings'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="section-card">
        <h3 className="section-title">SMTP test</h3>
        <p className="mt-2 text-sm text-slate-600">
          Send a test message to confirm the email settings above are correct.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="input sm:flex-1"
            onChange={(event) => setEmailTo(event.target.value)}
            placeholder="recipient@example.com"
            type="email"
            value={emailTo}
          />
          <button
            className="btn-primary"
            disabled={emailSending}
            onClick={handleSendTest}
            type="button"
          >
            {emailSending ? 'Sending…' : 'Send test email'}
          </button>
        </div>
        {emailMessage ? (
          <p className="mt-3 text-sm text-slate-700">{emailMessage}</p>
        ) : null}
      </section>

      <LookupsEditor />

      <section className="section-card">
        <h3 className="section-title">Unsupported portals</h3>
        <p className="mt-2 text-sm text-slate-600">
          Cases pointing to portals we don't yet have an adapter for. These won't be auto-fetched.
        </p>
        <div className="mt-4">
          {loading ? (
            <div className="text-sm text-slate-400">Loading…</div>
          ) : unsupported.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
              No unsupported requests pending.
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {unsupported.map((req) => (
                <li
                  className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
                  key={req.caseId}
                >
                  <div className="font-medium text-slate-900">{req.caseId}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {req.sourceUrl || '(no portal URL)'} — {req.courtType || 'unknown court type'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {isAdmin ? (
        <section className="section-card">
          <h3 className="section-title">Backup &amp; restore</h3>
          <p className="mt-2 text-sm text-slate-600">
            Save <strong>everything</strong> — cases, recipients, schedules and SMTP settings — to a single
            file. After an app update or on a new PC, restore it to get all your data back. No need to re-enter anything.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="btn-secondary"
              disabled={backupBusy}
              onClick={handleDownloadBackup}
              type="button"
            >
              {backupBusy ? 'Working…' : 'Download backup (.json)'}
            </button>
            <input
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
              ref={backupInputRef}
              type="file"
            />
            <button
              className="btn-secondary"
              disabled={backupBusy}
              onClick={() => backupInputRef.current && backupInputRef.current.click()}
              type="button"
            >
              Restore from backup…
            </button>
          </div>
          {backupError ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {backupError}
            </div>
          ) : null}
          {backupMessage ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {backupMessage}
            </div>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            The backup file contains your SMTP password and login data in plain text — store it somewhere safe.
            Restoring <strong>replaces</strong> all current data.
          </p>
        </section>
      ) : null}

      <section className="section-card">
        <h3 className="section-title">Activity logs</h3>
        <p className="mt-2 text-sm text-slate-600">
          Every check, email, and error is written to a log file. Open it to diagnose issues
          (e.g. why an email didn't send on a client machine).
        </p>
        {logFilePath ? (
          <p className="mt-3 break-all rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">
            {logFilePath}
          </p>
        ) : null}
        {typeof window !== 'undefined' && window.casecue && window.casecue.openLogs ? (
          <div className="mt-4">
            <button
              className="btn-secondary"
              onClick={() => window.casecue.openLogs()}
              type="button"
            >
              Open logs folder
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Open the file above in Notepad to view activity.
          </p>
        )}
      </section>

      {typeof window !== 'undefined' && window.casecue && window.casecue.isElectron ? (
        <section className="section-card">
          <h3 className="section-title">Application</h3>
          <p className="mt-2 text-sm text-slate-600">
            CaseCue keeps checking cases and sending emails in the background even when the
            window is hidden or closed with the X button. To open it again, run{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">casecue show</code> from a
            Command Prompt in the CaseCue folder (or just re-launch{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">CaseCue.exe</code>).
          </p>

          <div className="mt-4 grid gap-1 rounded-md bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <div>
              <span className="text-slate-500">Version:</span>{' '}
              <span className="font-mono">{window.casecue.version || '—'}</span>
              {serverVersion && serverVersion !== window.casecue.version ? (
                <span className="ml-2 font-semibold text-amber-700">
                  ⚠ window is v{window.casecue.version} but the running server is v{serverVersion} —
                  an old CaseCue process is likely still running. Run "casecue quit", confirm with
                  Task Manager that no CaseCue.exe remains, then relaunch.
                </span>
              ) : null}
            </div>
            <div className="break-all">
              <span className="text-slate-500">Running from:</span>{' '}
              <span className="font-mono">{window.casecue.execPath || '—'}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            After copying in a new build, always fully quit CaseCue first (Quit CaseCue button
            below, or <code className="rounded bg-slate-100 px-1 text-xs">casecue quit</code>) —
            closing the window alone does not stop the background process, so an old build can
            keep running unnoticed and a "new" launch just reveals it instead of starting fresh.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="btn-secondary"
              onClick={() => window.casecue.hideWindow()}
              type="button"
            >
              Hide to background
            </button>
            <button
              className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              onClick={() => {
                if (window.confirm('Quit CaseCue completely? This also stops the background scheduler — no more automatic checks or emails until you reopen it.')) {
                  window.casecue.quitApp();
                }
                if (window.casecue.refocus) {
                  window.casecue.refocus();
                }
              }}
              type="button"
            >
              Quit CaseCue
            </button>
          </div>
        </section>
      ) : null}

      <section className="section-card">
        <h3 className="section-title">Support &amp; contact</h3>
        <p className="mt-2 text-sm text-slate-600">
          Facing an issue or need help? Contact the developer.
        </p>
        <div className="mt-4 grid gap-2 text-sm text-slate-700">
          <div>
            <span className="text-slate-500">Name:</span>{' '}
            <strong className="text-slate-900">{SUPPORT_CONTACT.name}</strong>
          </div>
          <div>
            <span className="text-slate-500">Email:</span>{' '}
            <a className="text-brand-700 hover:underline" href={`mailto:${SUPPORT_CONTACT.email}`}>
              {SUPPORT_CONTACT.email}
            </a>
          </div>
          <div>
            <span className="text-slate-500">Phone:</span>{' '}
            <a className="text-brand-700 hover:underline" href={`tel:${SUPPORT_CONTACT.phone}`}>
              {SUPPORT_CONTACT.phone}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
