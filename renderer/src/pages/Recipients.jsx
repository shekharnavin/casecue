import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

import { fetchAppData, saveAppData } from '../lib/api.js';
import { downloadUserTemplate, parseUsersFile } from '../lib/bulkUsers.js';

const EMPTY_DRAFT = { email: '', name: '', password: '', phone: '' };

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'user';
}

export default function RecipientsPage({ currentUser }) {
  const isAdmin = currentUser && currentUser.role === 'admin';

  const [users, setUsers] = useState([]);
  const [savedCases, setSavedCases] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [passwordEditingId, setPasswordEditingId] = useState('');
  const [passwordEditValue, setPasswordEditValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAppData();
      setUsers(data.users || []);
      setSavedCases(data.savedCases || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAdd = useCallback(async () => {
    setError('');
    setMessage('');
    const name = draft.name.trim();
    if (!name) {
      setError('Recipient name is required.');
      return;
    }
    const email = draft.email.trim();
    const phone = draft.phone.trim();
    if (draft.password && !email && !phone) {
      setError('A recipient who can sign in must have an email or phone number.');
      return;
    }
    const loginIdSeed = email || phone || slugify(name);
    const newUser = {
      email,
      id: `${slugify(loginIdSeed)}-${Date.now()}`,
      loginId: slugify(loginIdSeed),
      name,
      phone,
      role: 'user',
    };
    if (draft.password) {
      newUser.password = draft.password;
    }

    setSaving(true);
    try {
      const updated = await saveAppData({
        savedCases,
        users: [...users, newUser],
      });
      setUsers(updated.users || []);
      setDraft(EMPTY_DRAFT);
      setMessage(
        newUser.password
          ? `Added ${name}. They can sign in with ${email || phone}.`
          : `Added ${name}.`,
      );
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }, [draft, savedCases, users]);

  const handleBulkFile = useCallback(
    async (event) => {
      const file = event.target.files && event.target.files[0];
      // Reset the input so selecting the same file again still fires onChange.
      if (bulkInputRef.current) {
        bulkInputRef.current.value = '';
      }
      if (!file) {
        return;
      }

      setError('');
      setMessage('');
      setBulkBusy(true);
      try {
        const rows = await parseUsersFile(file);
        if (!rows.length) {
          setError('That file has no rows. Download the template, fill it in, and try again.');
          return;
        }

        // Existing recipients we should not duplicate.
        const existingEmails = new Set(
          users.map((user) => user.email && user.email.toLowerCase()).filter(Boolean),
        );
        const existingPhones = new Set(
          users.map((user) => normalizePhone(user.phone)).filter(Boolean),
        );

        const toAdd = [];
        let skippedNoName = 0;
        let skippedDuplicate = 0;

        rows.forEach((row, index) => {
          const name = row.name.trim();
          if (!name) {
            skippedNoName += 1;
            return;
          }
          const email = row.email.trim();
          const phone = row.phone.trim();
          const emailKey = email.toLowerCase();
          const phoneKey = normalizePhone(phone);

          const isDuplicate =
            (emailKey && existingEmails.has(emailKey)) ||
            (phoneKey && existingPhones.has(phoneKey));
          if (isDuplicate) {
            skippedDuplicate += 1;
            return;
          }
          if (emailKey) {
            existingEmails.add(emailKey);
          }
          if (phoneKey) {
            existingPhones.add(phoneKey);
          }

          const loginIdSeed = email || phone || slugify(name);
          const newUser = {
            email,
            id: `${slugify(loginIdSeed)}-${Date.now()}-${index}`,
            loginId: slugify(loginIdSeed),
            name,
            phone,
            role: 'user',
          };
          if (row.password.trim()) {
            newUser.password = row.password.trim();
          }
          toAdd.push(newUser);
        });

        if (!toAdd.length) {
          setError(
            `No new recipients added. ${skippedDuplicate} already existed, ${skippedNoName} row(s) had no name.`,
          );
          return;
        }

        const updated = await saveAppData({
          savedCases,
          users: [...users, ...toAdd],
        });
        setUsers(updated.users || []);
        const parts = [`Added ${toAdd.length} recipient${toAdd.length === 1 ? '' : 's'}`];
        if (skippedDuplicate) {
          parts.push(`${skippedDuplicate} duplicate${skippedDuplicate === 1 ? '' : 's'} skipped`);
        }
        if (skippedNoName) {
          parts.push(`${skippedNoName} row${skippedNoName === 1 ? '' : 's'} without a name skipped`);
        }
        setMessage(`${parts.join(' · ')}.`);
      } catch (uploadError) {
        setError(`Could not read that file: ${uploadError.message}`);
      } finally {
        setBulkBusy(false);
      }
    },
    [savedCases, users],
  );

  const handleRemove = useCallback(
    async (userId) => {
      setError('');
      setMessage('');
      if (users.length <= 1) {
        setError('At least one recipient must remain.');
        return;
      }
      const target = users.find((user) => user.id === userId);
      if (target && target.role === 'admin') {
        const adminCount = users.filter((user) => user.role === 'admin').length;
        if (adminCount <= 1) {
          setError('Cannot remove the last admin.');
          return;
        }
      }
      setSaving(true);
      try {
        const nextUsers = users.filter((user) => user.id !== userId);
        const nextCases = savedCases.map((savedCase) => ({
          ...savedCase,
          recipientIds: (savedCase.recipientIds || []).filter((id) => id !== userId),
        }));
        const updated = await saveAppData({
          savedCases: nextCases,
          users: nextUsers,
        });
        setUsers(updated.users || []);
        setSavedCases(updated.savedCases || []);
        setMessage('Recipient removed.');
      } catch (saveError) {
        setError(saveError.message);
      } finally {
        setSaving(false);
      }
    },
    [savedCases, users],
  );

  const openPasswordEditor = useCallback((user) => {
    setPasswordEditingId(user.id);
    setPasswordEditValue('');
    setError('');
    setMessage('');
  }, []);

  const cancelPasswordEditor = useCallback(() => {
    setPasswordEditingId('');
    setPasswordEditValue('');
  }, []);

  const savePassword = useCallback(
    async (user, clearOnly = false) => {
      setError('');
      setMessage('');
      setSaving(true);
      try {
        const passwordValue = clearOnly ? '' : passwordEditValue;
        const updatedUsers = users.map((existing) =>
          existing.id === user.id ? { ...existing, password: passwordValue } : existing,
        );
        const updated = await saveAppData({
          savedCases,
          users: updatedUsers,
        });
        setUsers(updated.users || []);
        setPasswordEditingId('');
        setPasswordEditValue('');
        setMessage(
          clearOnly
            ? `Password cleared for ${user.name}. They can no longer sign in.`
            : `Password ${user.hasPassword ? 'updated' : 'set'} for ${user.name}.`,
        );
      } catch (saveError) {
        setError(saveError.message);
      } finally {
        setSaving(false);
      }
    },
    [passwordEditValue, savedCases, users],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Recipients</h2>
        <p className="mt-1 text-sm text-slate-500">
          People who receive case-update emails. Setting a password also lets them sign in to manage CaseCue.
          {!isAdmin ? ' Only an admin can add or remove recipients.' : null}
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {isAdmin ? (
        <section className="section-card">
          <h3 className="section-title">Add recipient</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Name *</span>
              <div className="mt-1.5">
                <input
                  className="input"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Full name"
                  value={draft.name}
                />
              </div>
            </label>
            <label className="block">
              <span className="field-label">Email</span>
              <div className="mt-1.5">
                <input
                  className="input"
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  placeholder="name@example.com"
                  type="email"
                  value={draft.email}
                />
              </div>
            </label>
            <label className="block">
              <span className="field-label">Phone</span>
              <div className="mt-1.5">
                <input
                  className="input"
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                  placeholder="10-digit number"
                  value={draft.phone}
                />
              </div>
            </label>
            <label className="block">
              <span className="field-label">Password (optional)</span>
              <div className="mt-1.5">
                <input
                  autoComplete="new-password"
                  className="input"
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                  placeholder="Leave blank — recipient only, cannot sign in"
                  type="password"
                  value={draft.password}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                If you set a password, this recipient signs in with their email or phone.
              </p>
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              className="btn-primary"
              disabled={saving || !draft.name.trim()}
              onClick={handleAdd}
              type="button"
            >
              {saving ? 'Saving…' : 'Add recipient'}
            </button>
          </div>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="section-card">
          <h3 className="section-title">Bulk upload recipients</h3>
          <p className="mt-2 text-sm text-slate-600">
            Adding lots of people? Download the Excel template, fill one row per recipient
            (<strong>Name</strong> is required; Email, Phone and Password are optional), then upload it.
            Duplicates (same email or phone) are skipped automatically.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-secondary" onClick={downloadUserTemplate} type="button">
              Download Excel template
            </button>
            <input
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleBulkFile}
              ref={bulkInputRef}
              type="file"
            />
            <button
              className="btn-primary"
              disabled={bulkBusy}
              onClick={() => bulkInputRef.current && bulkInputRef.current.click()}
              type="button"
            >
              {bulkBusy ? 'Uploading…' : 'Upload filled file'}
            </button>
            <span className="text-xs text-slate-500">Accepts .xlsx or .csv</span>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Sign-in</th>
              {isAdmin ? <th className="px-4 py-3"></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={isAdmin ? 6 : 5}>
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={isAdmin ? 6 : 5}>
                  No recipients yet.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const editing = passwordEditingId === user.id;
                return (
                  <Fragment key={user.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                      <td className="px-4 py-3 text-slate-700">{user.email || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{user.phone || '—'}</td>
                      <td className="px-4 py-3">
                        {user.role === 'admin' ? (
                          <span className="inline-flex rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            User
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.hasPassword ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Can sign in
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Email only
                          </span>
                        )}
                      </td>
                      {isAdmin ? (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-3">
                            <button
                              className="text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
                              disabled={saving}
                              onClick={() => openPasswordEditor(user)}
                              type="button"
                            >
                              {user.hasPassword ? 'Change password' : 'Set password'}
                            </button>
                            <button
                              className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                              disabled={saving}
                              onClick={() => handleRemove(user.id)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    {isAdmin && editing ? (
                      <tr className="bg-slate-50">
                        <td className="px-4 py-3" colSpan={6}>
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="block flex-1 min-w-[200px]">
                              <span className="field-label">
                                New password for {user.name}
                              </span>
                              <div className="mt-1.5">
                                <input
                                  autoComplete="new-password"
                                  autoFocus
                                  className="input"
                                  onChange={(event) => setPasswordEditValue(event.target.value)}
                                  placeholder="At least 4 characters"
                                  type="password"
                                  value={passwordEditValue}
                                />
                              </div>
                            </label>
                            <button
                              className="btn-primary"
                              disabled={saving || passwordEditValue.length < 4}
                              onClick={() => savePassword(user, false)}
                              type="button"
                            >
                              Save password
                            </button>
                            {user.hasPassword ? (
                              <button
                                className="btn-secondary"
                                disabled={saving}
                                onClick={() => savePassword(user, true)}
                                type="button"
                              >
                                Clear password
                              </button>
                            ) : null}
                            <button
                              className="btn-secondary"
                              disabled={saving}
                              onClick={cancelPasswordEditor}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
