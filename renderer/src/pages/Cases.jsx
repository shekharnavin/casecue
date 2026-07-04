import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import AddCaseModal from '../components/AddCaseModal.jsx';
import {
  fetchAppData,
  fetchPortals,
  runSchedulerNow,
  saveAppData,
} from '../lib/api.js';
import { DEFAULT_SCHEDULE_CRON, getAllSchedules, isTestingSchedule } from '../lib/schedules.js';

function formatTimestamp(value) {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusPill(savedCase) {
  if (savedCase.status === 'unsupported_portal') {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Unsupported portal
      </span>
    );
  }

  const lastResult = savedCase.lastResult;
  if (!lastResult) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        Pending first check
      </span>
    );
  }

  if (lastResult.ok) {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        OK
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
      Last fetch failed
    </span>
  );
}

export default function CasesPage({ currentUser }) {
  const [savedCases, setSavedCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [portals, setPortals] = useState([]);
  const [lookups, setLookups] = useState({ benches: [], caseTypes: [], courtTypes: [], schedules: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runMessage, setRunMessage] = useState('');
  const [runMessageTone, setRunMessageTone] = useState('info');
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, portalResp] = await Promise.all([fetchAppData(), fetchPortals()]);
      setSavedCases(data.savedCases || []);
      setUsers(data.users || []);
      setLookups(data.lookups || { benches: [], caseTypes: [], courtTypes: [], schedules: [] });
      setPortals(portalResp.portals || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const portalsById = useMemo(() => {
    const map = {};
    for (const portal of portals) {
      map[portal.id] = portal;
    }
    return map;
  }, [portals]);

  const scheduleOptions = useMemo(
    () => getAllSchedules(lookups.schedules || []),
    [lookups.schedules],
  );

  const usersById = useMemo(() => {
    const map = {};
    for (const user of users) {
      map[user.id] = user;
    }
    return map;
  }, [users]);

  const onRunAll = useCallback(async () => {
    setRunning(true);
    setRunMessage('');
    try {
      const summary = await runSchedulerNow();
      const tone = summary.failedCount > 0 ? 'warn' : 'ok';
      setRunMessageTone(tone);
      setRunMessage(
        `Checked ${summary.checkedCount} case${summary.checkedCount === 1 ? '' : 's'} — ` +
          `${summary.createdCount} succeeded, ${summary.failedCount} failed, ${summary.skippedCount} skipped.` +
          (summary.failedCount > 0
            ? ' Expand a row below to see the failure reason.'
            : ''),
      );
      await reload();
    } catch (runError) {
      setRunMessageTone('error');
      setRunMessage(`Run failed: ${runError.message}`);
    } finally {
      setRunning(false);
    }
  }, [reload]);

  const onRunOne = useCallback(
    async (savedCase) => {
      setBusyId(savedCase.id);
      setRunMessage('');
      try {
        // No single-case endpoint yet — run all and let the per-row last result reflect this case
        await runSchedulerNow();
        await reload();
        setRunMessageTone('info');
        setRunMessage(`Triggered a fresh check across all cases. See the row below for the result.`);
      } catch (runError) {
        setRunMessageTone('error');
        setRunMessage(`Run failed: ${runError.message}`);
      } finally {
        setBusyId('');
      }
    },
    [reload],
  );

  const onChangeSchedule = useCallback(
    async (savedCase, nextCron) => {
      if (nextCron === savedCase.schedule) {
        return;
      }
      setBusyId(savedCase.id);
      try {
        const nextCases = savedCases.map((existing) =>
          existing.id === savedCase.id ? { ...existing, schedule: nextCron } : existing,
        );
        const updated = await saveAppData({ savedCases: nextCases, users });
        setSavedCases(updated.savedCases || []);
        setRunMessageTone('ok');
        setRunMessage(`Updated schedule for ${savedCase.caseType} ${savedCase.caseNumber}/${savedCase.caseYear}.`);
      } catch (saveError) {
        setRunMessageTone('error');
        setRunMessage(`Could not update schedule: ${saveError.message}`);
      } finally {
        setBusyId('');
      }
    },
    [savedCases, users],
  );

  const onDeleteCase = useCallback(
    async (savedCase) => {
      const label = `${savedCase.caseType} ${savedCase.caseNumber}/${savedCase.caseYear}`;
      if (!window.confirm(`Stop tracking ${label}? This removes the case from CaseCue (the court website is not affected).`)) {
        return;
      }
      setBusyId(savedCase.id);
      try {
        const nextCases = savedCases.filter((existing) => existing.id !== savedCase.id);
        const updated = await saveAppData({ savedCases: nextCases, users });
        setSavedCases(updated.savedCases || []);
        setRunMessageTone('ok');
        setRunMessage(`Removed ${label}.`);
      } catch (deleteError) {
        setRunMessageTone('error');
        setRunMessage(`Could not delete: ${deleteError.message}`);
      } finally {
        setBusyId('');
      }
    },
    [savedCases, users],
  );

  const onAddCase = useCallback(
    async (newCase) => {
      const updated = await saveAppData({
        savedCases: [...savedCases, newCase],
        users,
      });
      setSavedCases(updated.savedCases || []);
      setRunMessageTone('ok');
      setRunMessage('Case added.');
    },
    [savedCases, users],
  );

  const onAddLookupItem = useCallback(
    async (kind, name) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) {
        throw new Error('Name is required.');
      }
      const existing = lookups[kind] || [];
      if (existing.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`"${trimmed}" is already in the list.`);
      }
      const newItem = {
        id: `${kind}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: trimmed,
      };
      const nextLookups = { ...lookups, [kind]: [...existing, newItem] };
      const updated = await saveAppData({
        lookups: nextLookups,
        savedCases,
        users,
      });
      setLookups(updated.lookups || lookups);
      return newItem;
    },
    [lookups, savedCases, users],
  );

  const toggleExpand = useCallback((caseId) => {
    setExpandedId((current) => (current === caseId ? '' : caseId));
  }, []);

  const messageClass =
    runMessageTone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : runMessageTone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : runMessageTone === 'ok'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-100 text-slate-700';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Tracked Cases</h2>
          <p className="mt-1 text-sm text-slate-500">
            {savedCases.length} case{savedCases.length === 1 ? '' : 's'} being monitored.
            Emails go out only when something changes on the portal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-secondary"
            disabled={running}
            onClick={onRunAll}
            type="button"
          >
            {running ? 'Checking…' : 'Run check now'}
          </button>
          <button className="btn-primary" onClick={() => setShowAddModal(true)} type="button">
            + Add case
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {runMessage ? (
        <div className={`rounded-md border px-4 py-3 text-sm ${messageClass}`}>{runMessage}</div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Case</th>
              <th className="px-4 py-3">Portal</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Next hearing</th>
              <th className="px-4 py-3">Last checked</th>
              <th className="px-4 py-3">Recipients</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : savedCases.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400" colSpan={8}>
                  No cases yet. Click <strong>+ Add case</strong> to start tracking one.
                </td>
              </tr>
            ) : (
              savedCases.map((savedCase) => {
                const portal = portalsById[savedCase.portalId];
                const lastResult = savedCase.lastResult;
                const lastSnapshot = savedCase.lastSnapshot;
                const nextHearing = lastSnapshot?.nextHearingDate || lastResult?.caseStatus?.nextHearingDate || '—';
                const recipients = (savedCase.recipientIds || [])
                  .map((id) => usersById[id]?.name)
                  .filter(Boolean);
                const expanded = expandedId === savedCase.id;
                const busy = busyId === savedCase.id;

                return (
                  <Fragment key={savedCase.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {savedCase.caseType} {savedCase.caseNumber}/{savedCase.caseYear}
                        </div>
                        <div className="text-xs text-slate-500">{savedCase.benchId || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700">
                          {portal?.name || savedCase.courtType || '—'}
                        </div>
                        {savedCase.sourceUrl ? (
                          <a
                            className="text-xs text-brand-500 hover:underline"
                            href={savedCase.sourceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Portal URL ↗
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none disabled:opacity-50"
                          disabled={busy || savedCase.status === 'unsupported_portal'}
                          onChange={(event) => onChangeSchedule(savedCase, event.target.value)}
                          value={savedCase.schedule || DEFAULT_SCHEDULE_CRON}
                        >
                          {scheduleOptions.map((option) => (
                            <option key={option.cron} value={option.cron}>
                              {option.label}
                            </option>
                          ))}
                          {savedCase.schedule &&
                          !scheduleOptions.some((option) => option.cron === savedCase.schedule) ? (
                            <option value={savedCase.schedule}>{savedCase.schedule}</option>
                          ) : null}
                        </select>
                        {isTestingSchedule(savedCase.schedule) ? (
                          <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Test mode — emails every fetch
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{nextHearing}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatTimestamp(lastResult?.fetchedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {recipients.length ? recipients.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3">{statusPill(savedCase)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            className="text-xs font-medium text-slate-600 hover:text-slate-900"
                            disabled={busy}
                            onClick={() => toggleExpand(savedCase.id)}
                            type="button"
                          >
                            {expanded ? 'Hide' : 'Details'}
                          </button>
                          <button
                            className="text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
                            disabled={busy || savedCase.status === 'unsupported_portal'}
                            onClick={() => onRunOne(savedCase)}
                            type="button"
                          >
                            {busy ? '…' : 'Run'}
                          </button>
                          <button
                            className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => onDeleteCase(savedCase)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="bg-slate-50">
                        <td className="px-4 py-4" colSpan={8}>
                          <CaseDetails savedCase={savedCase} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAddModal ? (
        <AddCaseModal
          currentUserId={currentUser?.id}
          lookups={lookups}
          onAddLookupItem={onAddLookupItem}
          onClose={() => setShowAddModal(false)}
          onSubmit={onAddCase}
          portals={portals}
          savedCases={savedCases}
          users={users}
        />
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start gap-4 py-1">
      <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-800">{value || <span className="text-slate-400">—</span>}</span>
    </div>
  );
}

function CaseDetails({ savedCase }) {
  const lastResult = savedCase.lastResult;
  const status = lastResult?.caseStatus;

  if (savedCase.status === 'unsupported_portal') {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This portal isn't supported yet — we don't have an adapter for{' '}
        <code className="rounded bg-amber-100 px-1">{savedCase.sourceUrl || savedCase.courtType}</code>.
        The case is saved but won't be auto-fetched.
      </div>
    );
  }

  if (!lastResult) {
    return (
      <div className="text-sm text-slate-500">
        No fetches yet. Click <strong>Run</strong> to trigger one.
      </div>
    );
  }

  if (!lastResult.ok) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <strong>Last fetch failed:</strong> {lastResult.error || 'Unknown error.'}
          {lastResult.error && /captcha|TWOCAPTCHA/i.test(lastResult.error) ? (
            <div className="mt-1 text-xs">
              This usually means <code className="rounded bg-rose-100 px-1">TWOCAPTCHA_API_KEY</code> is missing in{' '}
              <code className="rounded bg-rose-100 px-1">server/.env</code>. Add the key and restart, then click Run.
            </div>
          ) : null}
        </div>
        <DetailRow label="Attempted at" value={lastResult.fetchedAt && new Date(lastResult.fetchedAt).toLocaleString()} />
        <DetailRow label="Attempts" value={lastResult.attempts || lastResult.attempt || '—'} />
      </div>
    );
  }

  return (
    <div>
      <DetailRow label="Case number" value={status?.caseNumber} />
      <DetailRow label="Next hearing" value={status?.nextHearingDate} />
      <DetailRow label="Purpose" value={status?.lastPostedFor} />
      <DetailRow label="Status" value={status?.status} />
      <DetailRow label="Before" value={status?.judge} />
      <DetailRow label="Petitioner" value={status?.petitioner} />
      <DetailRow label="Respondent" value={status?.respondent} />
      <DetailRow label="Petitioner advocate" value={status?.petitionerAdvocate} />
      <DetailRow label="Filed on" value={status?.filingDate} />
      <DetailRow label="Last fetched" value={new Date(lastResult.fetchedAt).toLocaleString()} />
      {lastResult.source ? (
        <DetailRow
          label="Source"
          value={
            <a
              className="text-brand-500 hover:underline"
              href={lastResult.source}
              rel="noreferrer"
              target="_blank"
            >
              {lastResult.source}
            </a>
          }
        />
      ) : null}
    </div>
  );
}
