import { useMemo, useState } from 'react';

const FREQUENCY_OPTIONS = [
  { description: 'Pick one or more times of day', id: 'daily', label: 'Daily' },
  { description: 'Same times but only Mon–Fri', id: 'weekdays', label: 'Weekdays only' },
  { description: 'Repeat every N hours, all day', id: 'hourly', label: 'Every N hours' },
  { description: 'For testing — every N minutes', id: 'minutes', label: 'Every N minutes (testing)' },
];

const DEFAULT_TIMES = ['09:00'];

function formatTimeLabel(hour, minute) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const mm = String(minute).padStart(2, '0');
  return `${display}:${mm} ${period}`;
}

function buildSchedule(mode, times, hours, minutes) {
  if (mode === 'daily' || mode === 'weekdays') {
    if (!times.length) {
      return { cron: '', error: 'Add at least one time.', label: '' };
    }
    const parsed = [];
    for (const value of times) {
      const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
      if (!match) {
        return { cron: '', error: 'Time must be in HH:MM format.', label: '' };
      }
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return { cron: '', error: 'Invalid time.', label: '' };
      }
      parsed.push({ hour, minute });
    }
    const minuteSet = new Set(parsed.map((entry) => entry.minute));
    if (minuteSet.size > 1) {
      return {
        cron: '',
        error: 'All times must share the same minute (e.g. all at :00 or all at :30).',
        label: '',
      };
    }
    const minute = parsed[0].minute;
    const hourList = Array.from(new Set(parsed.map((entry) => entry.hour)))
      .sort((a, b) => a - b)
      .join(',');
    const dayOfWeek = mode === 'weekdays' ? '1-5' : '*';
    const cron = `${minute} ${hourList} * * ${dayOfWeek}`;

    const sortedParsed = [...parsed].sort((a, b) => a.hour - b.hour);
    const niceTimes = sortedParsed.map((entry) => formatTimeLabel(entry.hour, entry.minute)).join(', ');
    const prefix = mode === 'weekdays' ? 'Weekdays' : 'Daily';
    return { cron, error: '', label: `${prefix} at ${niceTimes}` };
  }

  if (mode === 'hourly') {
    const n = Number(hours);
    if (!Number.isInteger(n) || n < 1 || n > 23) {
      return { cron: '', error: 'Hours must be a whole number from 1 to 23.', label: '' };
    }
    return {
      cron: `0 */${n} * * *`,
      error: '',
      label: `Every ${n} hour${n === 1 ? '' : 's'}`,
    };
  }

  if (mode === 'minutes') {
    const n = Number(minutes);
    if (!Number.isInteger(n) || n < 1 || n > 59) {
      return { cron: '', error: 'Minutes must be a whole number from 1 to 59.', label: '' };
    }
    return {
      cron: `*/${n} * * * *`,
      error: '',
      label: `Every ${n} minute${n === 1 ? '' : 's'} (testing)`,
    };
  }

  return { cron: '', error: 'Pick a frequency.', label: '' };
}

export default function ScheduleBuilder({ onAdd, saving }) {
  const [mode, setMode] = useState('daily');
  const [times, setTimes] = useState(DEFAULT_TIMES);
  const [hours, setHours] = useState(4);
  const [minutes, setMinutes] = useState(5);
  const [customLabel, setCustomLabel] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rawCron, setRawCron] = useState('');
  const [rawLabel, setRawLabel] = useState('');
  const [localError, setLocalError] = useState('');

  const generated = useMemo(
    () => buildSchedule(mode, times, hours, minutes),
    [hours, minutes, mode, times],
  );

  const effectiveCron = showAdvanced ? rawCron.trim() : generated.cron;
  const effectiveLabel = (showAdvanced ? rawLabel.trim() : customLabel.trim() || generated.label) || '';

  const updateTime = (index, value) =>
    setTimes((current) => current.map((existing, idx) => (idx === index ? value : existing)));

  const addTime = () => setTimes((current) => [...current, '12:00']);
  const removeTime = (index) =>
    setTimes((current) => (current.length <= 1 ? current : current.filter((_, idx) => idx !== index)));

  const handleSubmit = async () => {
    setLocalError('');

    if (showAdvanced) {
      if (!rawCron.trim()) {
        setLocalError('Enter a cron expression.');
        return;
      }
      if (!rawLabel.trim()) {
        setLocalError('Enter a label.');
        return;
      }
    } else if (generated.error) {
      setLocalError(generated.error);
      return;
    }

    try {
      await onAdd({ cron: effectiveCron, label: effectiveLabel });
      setTimes(DEFAULT_TIMES);
      setHours(4);
      setMinutes(5);
      setMode('daily');
      setCustomLabel('');
      setRawCron('');
      setRawLabel('');
    } catch (saveError) {
      setLocalError(saveError.message);
    }
  };

  return (
    <div className="rounded-md border border-slate-200 p-4">
      <h4 className="text-sm font-semibold text-slate-700">Build a new schedule</h4>
      <p className="mt-1 text-xs text-slate-500">
        Pick how often it should run — we'll generate the cron expression for you.
      </p>

      {!showAdvanced ? (
        <>
          <div className="mt-4">
            <span className="field-label">Frequency</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {FREQUENCY_OPTIONS.map((option) => (
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition ${
                    mode === option.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  key={option.id}
                >
                  <input
                    checked={mode === option.id}
                    className="mt-0.5"
                    name="schedule-mode"
                    onChange={() => setMode(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-900">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {mode === 'daily' || mode === 'weekdays' ? (
            <div className="mt-4">
              <span className="field-label">Times of day</span>
              <p className="mt-1 text-xs text-slate-500">
                Add up to 6 times. All times must share the same minute (e.g. all at :00 or all at :30).
              </p>
              <div className="mt-2 space-y-2">
                {times.map((value, index) => (
                  <div className="flex items-center gap-2" key={index}>
                    <input
                      className="input w-32"
                      onChange={(event) => updateTime(index, event.target.value)}
                      step="60"
                      type="time"
                      value={value}
                    />
                    {times.length > 1 ? (
                      <button
                        className="text-xs font-medium text-rose-600 hover:text-rose-700"
                        onClick={() => removeTime(index)}
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {times.length < 6 ? (
                <button
                  className="mt-2 text-xs font-medium text-brand-700 hover:text-brand-900"
                  onClick={addTime}
                  type="button"
                >
                  + Add another time
                </button>
              ) : null}
            </div>
          ) : null}

          {mode === 'hourly' ? (
            <div className="mt-4">
              <span className="field-label">Run every</span>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  className="input w-24"
                  max={23}
                  min={1}
                  onChange={(event) => setHours(event.target.value)}
                  type="number"
                  value={hours}
                />
                <span className="text-sm text-slate-700">hour(s)</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Quick picks:{' '}
                {[1, 2, 3, 4, 6, 8, 12].map((value, idx) => (
                  <span key={value}>
                    <button
                      className="text-brand-700 hover:underline"
                      onClick={() => setHours(value)}
                      type="button"
                    >
                      {value}
                    </button>
                    {idx < 6 ? ' · ' : ''}
                  </span>
                ))}
              </p>
            </div>
          ) : null}

          {mode === 'minutes' ? (
            <div className="mt-4">
              <span className="field-label">Run every</span>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  className="input w-24"
                  max={59}
                  min={1}
                  onChange={(event) => setMinutes(event.target.value)}
                  type="number"
                  value={minutes}
                />
                <span className="text-sm text-slate-700">minute(s)</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Quick picks:{' '}
                {[1, 5, 10, 15, 30].map((value, idx) => (
                  <span key={value}>
                    <button
                      className="text-brand-700 hover:underline"
                      onClick={() => setMinutes(value)}
                      type="button"
                    >
                      {value}
                    </button>
                    {idx < 4 ? ' · ' : ''}
                  </span>
                ))}
              </p>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <span className="field-label">Label (auto-generated, editable)</span>
              <div className="mt-1.5">
                <input
                  className="input"
                  onChange={(event) => setCustomLabel(event.target.value)}
                  placeholder={generated.label || 'e.g. Daily at 8:00 AM'}
                  value={customLabel}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Preview: <strong className="text-slate-800">{effectiveLabel || '(no label yet)'}</strong>{' '}
            ·{' '}
            <code className="rounded bg-white px-1.5 py-0.5 text-[11px]">
              {generated.cron || '(invalid)'}
            </code>
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
          <div>
            <span className="field-label">Label</span>
            <div className="mt-1.5">
              <input
                className="input"
                onChange={(event) => setRawLabel(event.target.value)}
                placeholder="e.g. Daily 9 AM weekdays"
                value={rawLabel}
              />
            </div>
          </div>
          <div>
            <span className="field-label">Cron expression</span>
            <div className="mt-1.5">
              <input
                className="input font-mono text-xs"
                onChange={(event) => setRawCron(event.target.value)}
                placeholder="0 9 * * 1-5"
                value={rawCron}
              />
            </div>
          </div>
        </div>
      )}

      {localError || (!showAdvanced && generated.error && (times.length || mode !== 'daily')) ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {localError || generated.error}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <button
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
          onClick={() => setShowAdvanced((value) => !value)}
          type="button"
        >
          {showAdvanced ? '← Back to friendly builder' : 'Advanced: enter cron directly →'}
        </button>
        <button
          className="btn-primary"
          disabled={saving || !effectiveCron || !effectiveLabel}
          onClick={handleSubmit}
          type="button"
        >
          {saving ? 'Saving…' : 'Add schedule'}
        </button>
      </div>
    </div>
  );
}
