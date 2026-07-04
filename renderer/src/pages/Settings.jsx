import { useCallback, useEffect, useState } from 'react';

import LookupsEditor from '../components/LookupsEditor.jsx';
import {
  changePassword,
  fetchAppData,
  fetchSchedulerState,
  fetchUnsupportedRequests,
  saveSmtpSettings,
  sendEmailTest,
} from '../lib/api.js';
import { SUPPORT_CONTACT } from '../lib/support.js';

const EMPTY_SMTP_FORM = { from: '', host: '', pass: '', port: '587', user: '' };

const SCHEDULE_LABELS = {
  '0 8 * * *': 'Daily 8:00 AM',
  '0 18 * * *': 'Daily 6:00 PM',
  '0 8,18 * * *': 'Twice daily — 8:00 AM and 6:00 PM',
  '0 */6 * * *': 'Every 6 hours',
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
