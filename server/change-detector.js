const TRACKED_FIELDS = [
  { id: 'nextHearingDate', label: 'Next Hearing Date' },
  { id: 'status', label: 'Status' },
  { id: 'lastPostedFor', label: 'Purpose' },
  { id: 'judge', label: 'Before (Judge)' },
];

function normalizeValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildSnapshot(result) {
  if (!result || !result.ok || !result.caseStatus) {
    return null;
  }

  const caseStatus = result.caseStatus;
  const snapshot = {
    fetchedAt: result.fetchedAt || new Date().toISOString(),
  };

  for (const field of TRACKED_FIELDS) {
    snapshot[field.id] = normalizeValue(caseStatus[field.id]);
  }

  return snapshot;
}

function diffSnapshots(previous, next) {
  if (!next) {
    return { changes: [], isFirstFetch: false };
  }

  if (!previous) {
    return { changes: [], isFirstFetch: true };
  }

  const changes = [];
  for (const field of TRACKED_FIELDS) {
    const before = normalizeValue(previous[field.id]);
    const after = normalizeValue(next[field.id]);
    if (before !== after) {
      changes.push({
        after,
        before,
        field: field.id,
        label: field.label,
      });
    }
  }

  return { changes, isFirstFetch: false };
}

function summarizeChanges(changes) {
  if (!changes.length) {
    return '';
  }

  return changes
    .map((change) => `${change.label}: ${change.before || '(empty)'} → ${change.after || '(empty)'}`)
    .join(' · ');
}

// Schedules like "*/5 * * * *" (every N minutes) are treated as testing mode —
// emails fire on every successful fetch, not just on changes. Useful for verifying
// the SMTP + scheduler pipeline. Switch to a normal schedule to restore silence.
const TESTING_SCHEDULE_PATTERN = /^\*\/\d+ \* \* \* \*$/;

function isTestingSchedule(cron) {
  return TESTING_SCHEDULE_PATTERN.test(String(cron || '').trim());
}

module.exports = {
  buildSnapshot,
  diffSnapshots,
  isTestingSchedule,
  summarizeChanges,
  TRACKED_FIELDS,
};
