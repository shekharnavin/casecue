import { useCallback, useEffect, useState } from 'react';

import { fetchAppData, saveAppData } from '../lib/api.js';
import { BUILT_IN_SCHEDULES } from '../lib/schedules.js';
import ScheduleBuilder from './ScheduleBuilder.jsx';

const EMPTY_LOOKUPS = { benches: [], caseTypes: [], courtTypes: [], schedules: [] };

function nextId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export default function LookupsEditor() {
  const [lookups, setLookups] = useState(EMPTY_LOOKUPS);
  const [savedCases, setSavedCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAppData();
      setLookups(data.lookups || EMPTY_LOOKUPS);
      setSavedCases(data.savedCases || []);
      setUsers(data.users || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const persist = useCallback(
    async (nextLookups, successMessage) => {
      setSaving(true);
      setError('');
      setMessage('');
      try {
        const updated = await saveAppData({ lookups: nextLookups, savedCases, users });
        setLookups(updated.lookups || EMPTY_LOOKUPS);
        setMessage(successMessage || 'Saved.');
      } catch (saveError) {
        setError(saveError.message);
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [savedCases, users],
  );

  const addSchedule = useCallback(
    async ({ cron, label }) => {
      const cronExpr = String(cron || '').trim();
      const finalLabel = String(label || '').trim();
      if (!cronExpr || !finalLabel) {
        throw new Error('Both label and schedule are required.');
      }
      const cronPattern = /^[\d\*\/,\-]+(\s+[\d\*\/,\-]+){4}$/;
      if (!cronPattern.test(cronExpr)) {
        throw new Error("That doesn't look like a valid cron expression.");
      }
      const builtInMatch = BUILT_IN_SCHEDULES.find((preset) => preset.cron === cronExpr);
      if (builtInMatch) {
        throw new Error(
          `"${builtInMatch.label}" is already a built-in preset — pick a different time or use the existing one.`,
        );
      }
      const customMatch = lookups.schedules.find((item) => item.cron === cronExpr);
      if (customMatch) {
        throw new Error(
          `"${customMatch.label}" already covers this cron (${customMatch.cron}). Remove it first if you want to rename.`,
        );
      }

      const next = {
        ...lookups,
        schedules: [...lookups.schedules, { cron: cronExpr, id: nextId('sched'), label: finalLabel }],
      };
      await persist(next, `Added "${finalLabel}".`);
    },
    [lookups, persist],
  );

  const removeSchedule = useCallback(
    (id) => {
      const target = lookups.schedules.find((item) => item.id === id);
      if (!target) return;
      if (
        !window.confirm(
          `Remove "${target.label}"? Cases using this cron will keep running on it until you change them.`,
        )
      ) {
        return;
      }
      const next = {
        ...lookups,
        schedules: lookups.schedules.filter((item) => item.id !== id),
      };
      persist(next, 'Schedule removed.');
    },
    [lookups, persist],
  );

  return (
    <section className="section-card">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Custom schedules</h3>
        <button className="btn-secondary" disabled={loading} onClick={reload} type="button">
          {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Built-in: Daily 8 AM, Daily 6 PM, Twice daily, Every 6 hours. Add more here — they appear in the Add Case form and in the per-row schedule dropdown.
      </p>

      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="mt-5">
        <ScheduleBuilder onAdd={addSchedule} saving={saving} />
      </div>

      {lookups.schedules.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">
          No custom schedules yet.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
          {lookups.schedules.map((item) => (
            <li className="flex items-center justify-between px-3 py-2 text-sm" key={item.id}>
              <span>
                <span className="font-medium text-slate-800">{item.label}</span>
                <span className="ml-2 text-xs text-slate-500">
                  <code className="rounded bg-slate-100 px-1">{item.cron}</code>
                </span>
              </span>
              <button
                className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                disabled={saving}
                onClick={() => removeSchedule(item.id)}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
