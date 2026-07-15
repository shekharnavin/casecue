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

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Parse the various date formats Indian court portals return into a Date
// (date-only). Handles DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, and
// "DD Mon YYYY". Returns null if it can't be parsed.
function parseHearingDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  let m = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  m = raw.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  m = raw.match(/(\d{1,2})[ \-]([A-Za-z]{3,})[ \-,]*(\d{4})/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month != null) {
      return new Date(Number(m[3]), month, Number(m[1]));
    }
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

// True only when the next hearing date is strictly after today (tomorrow or
// later). Past dates, today, empty, and unparseable values return false.
function isFutureHearing(value) {
  const date = parseHearingDate(value);
  if (!date) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date.getTime() > today.getTime();
}

module.exports = {
  buildSnapshot,
  diffSnapshots,
  isFutureHearing,
  isTestingSchedule,
  parseHearingDate,
  summarizeChanges,
  TRACKED_FIELDS,
};
