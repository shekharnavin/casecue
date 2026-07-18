const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const cron = require('node-cron');
const PKG = require(path.join(__dirname, '..', 'package.json'));

require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  COURT_BASE_URL,
  courtFetch,
  detectImageContentType,
  ensureCourtSession,
  getSession,
  pruneSessions,
} = require('./court-client');
const { parseCaseStatus, parseOptions } = require('./court-parser');
const {
  getAdapterById,
  inferPortalIdForLegacyCase,
  listAdapters,
  matchAdapterByUrl,
} = require('./adapters');
const {
  buildSnapshot,
  diffSnapshots,
  isTestingSchedule,
  isTomorrowHearing,
  summarizeChanges,
} = require('./change-detector');
const {
  createSession,
  extractBearerToken,
  hashPassword,
  hasAnyPasswords,
  revokeToken,
  validateToken,
  verifyPassword,
} = require('./auth');
const {
  getSmtpSummary,
  isEmailConfigured,
  sendCaseUpdateEmail,
  sendTestEmail,
  setSmtpConfig,
} = require('./email-sender');
const {
  DEFAULT_SCHEDULE,
  listScheduledJobs,
  runAllCasesNow,
  runCaseFetch,
  syncScheduledJobs,
} = require('./scheduler');

// Keep the backend alive even if a court fetch, OCR worker, or email send throws
// asynchronously. Without this, an error re-thrown from a worker thread (e.g.
// tesseract.js) would kill the whole server and the UI would show "Failed to
// fetch" everywhere. Log and carry on instead.
process.on('uncaughtException', (error) => {
  console.error(`[server] uncaughtException (kept alive): ${error && error.stack ? error.stack : error}`);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[server] unhandledRejection (kept alive): ${reason && reason.stack ? reason.stack : reason}`);
});

const PORT = Number(process.env.PORT || 4005);
// When packaged, the app bundle is read-only, so the Electron shell passes a
// writable location (userData) via CASECUE_DATA_DIR. Running from source it
// stays alongside the server file as before.
const DATA_DIR = process.env.CASECUE_DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'scheduler-data.json');

// Persist all activity to a log file so issues can be diagnosed on client
// machines. Do this first so every console.* below is captured.
const { getLogFilePath, initLogging } = require('./logger');
initLogging(DATA_DIR);

const DEFAULT_APP_DATA = {
  notifications: [],
  savedCases: [
    {
      benchId: 'B',
      caseNumber: '17880',
      caseType: 'WP',
      caseYear: '2024',
      courtType: 'highCourtKarnataka',
      id: 'root-highCourtKarnataka-B-WP-17880-2024',
      lastSnapshot: null,
      portalId: 'karnatakaHC',
      recipientIds: ['root'],
      schedule: DEFAULT_SCHEDULE,
      sourceUrl: 'https://judiciary.karnataka.gov.in/casemenu.php',
      status: 'active',
      userId: 'root',
    },
    {
      benchId: 'DRT_BENGALURU_2',
      caseNumber: '1050',
      caseType: 'OA',
      caseYear: '2022',
      courtType: 'drt',
      id: 'root-drt-DRT_BENGALURU_2-OA-1050-2022',
      lastSnapshot: null,
      portalId: '',
      recipientIds: [],
      schedule: DEFAULT_SCHEDULE,
      sourceUrl: '',
      status: 'unsupported_portal',
      userId: 'root',
    },
  ],
  users: [
    {
      email: 'admin@casecue.local',
      id: 'admin',
      loginId: 'admin',
      name: 'Admin',
      phone: '',
      role: 'admin',
    },
  ],
  lookups: {
    benches: [],
    caseTypes: [],
    courtTypes: [],
    schedules: [],
  },
  smtp: {
    from: '',
    host: '',
    pass: '',
    port: 587,
    user: '',
  },
};

const DEFAULT_ADMIN_PASSWORD = 'password123';

const EMPTY_SMTP = { from: '', host: '', pass: '', port: 587, user: '' };

const COURT_NAMES = {
  drt: 'Debt Recovery Tribunal',
  highCourtKarnataka: 'High Court of Karnataka',
  nclt: 'National Company Law Tribunal',
};

const BENCH_NAMES = {
  B: 'Bengaluru Bench',
  BENGALURU: 'Bengaluru Bench',
  CHENNAI: 'Chennai Bench',
  D: 'Dharwad Bench',
  DRAT_CHENNAI: 'DRAT Chennai',
  DRT_BENGALURU: 'DRT Bengaluru',
  DRT_BENGALURU_2: 'Debts Recovery Tribunal Bangalore (DRT 2)',
  DRT_CHENNAI: 'DRT Chennai',
  DRT_DELHI: 'DRT Delhi',
  DRT_MUMBAI: 'DRT Mumbai',
  HYDERABAD: 'Hyderabad Bench',
  K: 'Kalaburagi Bench',
  KOLKATA: 'Kolkata Bench',
  MUMBAI: 'Mumbai Bench',
  NEW_DELHI: 'New Delhi Bench',
};

const DRT_REFERENCE_CASES = [
  {
    advocateName: 'NAYANA TARA BG',
    benchId: 'DRT_BENGALURU_2',
    caseNumber: '1050',
    caseStatus: 'PENDING',
    caseType: 'OA',
    caseYear: '2022',
    courtType: 'drt',
    dateOfFiling: '28/12/2021',
    diaryNumber: '1965/2021',
    inCourtOf: 'Registrar',
    nextListingDate: '08/06/2026',
    nextListingPurpose: 'SUMMONS',
    petitionerAddress: 'SAMB 2ND FLOOR OFFICE COMPLEX LHO CAMPUS NO 65 ST MARKS ROAD',
    petitionerName: 'STATE BANK OF INDIA',
    tribunalName: 'DEBTS RECOVERY TRIBUNAL BANGALORE (DRT 2)',
  },
];

let dataMutex = Promise.resolve();

function withDataLock(work) {
  const next = dataMutex.then(work, work);
  dataMutex = next.catch(() => undefined);
  return next;
}

function cloneDefaultAppData() {
  return JSON.parse(JSON.stringify(DEFAULT_APP_DATA));
}

function normalizeCaseNumber(value) {
  return String(value || '').trim().replace(/\D/g, '');
}

const EMPTY_LOOKUPS = { benches: [], caseTypes: [], courtTypes: [], schedules: [] };

function normalizeSmtp(smtp) {
  const source = smtp && typeof smtp === 'object' ? smtp : {};
  return {
    from: String(source.from || '').trim(),
    host: String(source.host || '').trim(),
    pass: String(source.pass || ''),
    port: Number(source.port) || 587,
    user: String(source.user || '').trim(),
  };
}

function normalizeAppData(data) {
  const fallback = cloneDefaultAppData();
  const incomingLookups = data && data.lookups && typeof data.lookups === 'object' ? data.lookups : {};

  return {
    notifications: Array.isArray(data?.notifications) ? data.notifications : fallback.notifications,
    savedCases: Array.isArray(data?.savedCases) ? data.savedCases : fallback.savedCases,
    users: Array.isArray(data?.users) && data.users.length ? data.users : fallback.users,
    lookups: {
      benches: Array.isArray(incomingLookups.benches) ? incomingLookups.benches : [],
      caseTypes: Array.isArray(incomingLookups.caseTypes) ? incomingLookups.caseTypes : [],
      courtTypes: Array.isArray(incomingLookups.courtTypes) ? incomingLookups.courtTypes : [],
      schedules: Array.isArray(incomingLookups.schedules) ? incomingLookups.schedules : [],
    },
    smtp: normalizeSmtp(data?.smtp),
  };
}

async function loadAppDataRaw() {
  try {
    const rawData = await fs.readFile(DATA_FILE, 'utf8');
    return normalizeAppData(JSON.parse(rawData));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not read scheduler data: ${error.message}`);
    }
    return cloneDefaultAppData();
  }
}

async function saveAppDataRaw(data) {
  const normalizedData = normalizeAppData(data);
  await fs.writeFile(DATA_FILE, `${JSON.stringify(normalizedData, null, 2)}\n`, 'utf8');
  return normalizedData;
}

function loadAppData() {
  return withDataLock(() => loadAppDataRaw());
}

function saveAppData(data) {
  return withDataLock(() => saveAppDataRaw(data));
}

function getCourtName(courtType) {
  return COURT_NAMES[courtType] || courtType || 'Court';
}

function getBenchName(benchId) {
  return BENCH_NAMES[benchId] || benchId || 'Bench';
}

function getCaseReference(savedCase) {
  return `${savedCase.caseType || 'Case'} ${savedCase.caseNumber || ''}/${
    savedCase.caseYear || ''
  }`.trim();
}

function buildSavedCaseId(savedCase) {
  return [
    savedCase.userId || 'user',
    savedCase.courtType || 'court',
    savedCase.benchId || 'bench',
    savedCase.caseType || 'case',
    String(savedCase.caseNumber || '').trim(),
    String(savedCase.caseYear || '').trim(),
  ].join('-');
}

function sanitizeUsers(users, existingUsers = []) {
  if (!Array.isArray(users) || !users.length) {
    return ensureDefaultAdmin([]);
  }

  const existingById = new Map(existingUsers.map((user) => [user.id, user]));

  const cleaned = users.map((user, index) => {
    const id = String(user.id || `user-${index + 1}`).trim();
    const previous = existingById.get(id) || {};

    let passwordHash = previous.passwordHash || '';
    if ('password' in user) {
      const plaintext = String(user.password || '');
      passwordHash = plaintext ? hashPassword(plaintext) : '';
    }

    const requestedRole = String(user.role || '').toLowerCase();
    const role = requestedRole === 'admin' || requestedRole === 'user'
      ? requestedRole
      : previous.role || 'user';

    return {
      email: String(user.email || '').trim(),
      id,
      loginId: String(user.loginId || user.name || `user-${index + 1}`).trim(),
      name: String(user.name || user.loginId || `User ${index + 1}`).trim(),
      passwordHash,
      phone: String(user.phone || '').trim(),
      role,
    };
  });

  return ensureDefaultAdmin(cleaned);
}

// Clean a user coming from a backup file, keeping its scrypt passwordHash as-is
// (unlike sanitizeUsers, which only sets a hash from a new plaintext password).
function sanitizeImportedUser(user, index) {
  const requestedRole = String((user && user.role) || '').toLowerCase();
  return {
    email: String((user && user.email) || '').trim(),
    id: String((user && user.id) || `user-${index + 1}`).trim(),
    loginId: String((user && (user.loginId || user.name)) || `user-${index + 1}`).trim(),
    name: String((user && (user.name || user.loginId)) || `User ${index + 1}`).trim(),
    passwordHash: user && typeof user.passwordHash === 'string' ? user.passwordHash : '',
    phone: String((user && user.phone) || '').trim(),
    role: requestedRole === 'admin' || requestedRole === 'user' ? requestedRole : 'user',
  };
}

function ensureDefaultAdmin(users) {
  const upgraded = users.map((user) => ({ ...user, role: user.role || 'user' }));
  const hasAdmin = upgraded.some((user) => user.role === 'admin');

  if (!hasAdmin) {
    const adminUser = {
      email: 'admin@casecue.local',
      id: 'admin',
      loginId: 'admin',
      name: 'Admin',
      passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
      phone: '',
      role: 'admin',
    };
    return [adminUser, ...upgraded];
  }

  // An admin exists but nobody has a password yet (fresh install / seeded
  // default data). Give the first admin the default password so the login the
  // whole app depends on actually works — the UI then nags them to change it.
  const anyPassword = upgraded.some((user) => user.passwordHash);
  if (!anyPassword) {
    let seeded = false;
    return upgraded.map((user) => {
      if (!seeded && user.role === 'admin') {
        seeded = true;
        return { ...user, passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD) };
      }
      return user;
    });
  }

  return upgraded;
}

function publicUsers(users) {
  return users.map((user) => {
    const { passwordHash, ...rest } = user;
    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
      role: rest.role || 'user',
    };
  });
}

function publicSmtp(smtp) {
  const source = normalizeSmtp(smtp);
  return {
    from: source.from,
    hasPass: Boolean(source.pass),
    host: source.host,
    port: source.port,
    user: source.user,
  };
}

// Push the stored SMTP settings into the email sender so scheduled emails and
// the "send test email" button use the UI-configured mailbox.
function applySmtpConfig(smtp) {
  setSmtpConfig(normalizeSmtp(smtp));
}

function sanitizeNameList(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  const seen = new Set();
  return items
    .map((item, index) => ({
      id: String((item && item.id) || `item-${Date.now()}-${index}`).trim(),
      name: String((item && item.name) || '').trim(),
    }))
    .filter((item) => {
      if (!item.name) {
        return false;
      }
      const key = item.name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function sanitizeSchedulePresets(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  const seen = new Set();
  return items
    .map((item, index) => {
      const cronExpr = String((item && item.cron) || '').trim();
      return {
        cron: cronExpr,
        id: String((item && item.id) || `sched-${Date.now()}-${index}`).trim(),
        label: String((item && item.label) || cronExpr).trim(),
      };
    })
    .filter((item) => {
      if (!item.label || !item.cron) {
        return false;
      }
      if (!cron.validate(item.cron)) {
        return false;
      }
      if (seen.has(item.cron)) {
        return false;
      }
      seen.add(item.cron);
      return true;
    });
}

function sanitizeLookups(lookups) {
  const source = lookups && typeof lookups === 'object' ? lookups : {};
  return {
    benches: sanitizeNameList(source.benches),
    caseTypes: sanitizeNameList(source.caseTypes),
    courtTypes: sanitizeNameList(source.courtTypes),
    schedules: sanitizeSchedulePresets(source.schedules),
  };
}

function lookupsChanged(incoming, current) {
  const safeCurrent = current || EMPTY_LOOKUPS;
  return JSON.stringify(incoming) !== JSON.stringify(safeCurrent);
}

function isUsingDefaultAdminPassword(users) {
  const admin = users.find((user) => user.role === 'admin');
  if (!admin || !admin.passwordHash) {
    return false;
  }
  return verifyPassword(DEFAULT_ADMIN_PASSWORD, admin.passwordHash);
}

function sanitizeSavedCases(savedCases, existingCases = []) {
  if (!Array.isArray(savedCases)) {
    return cloneDefaultAppData().savedCases;
  }

  const existingById = new Map(existingCases.map((item) => [item.id, item]));

  return savedCases
    .map((savedCase) => {
      const cleanedCase = {
        benchId: String(savedCase.benchId || '').trim(),
        caseNumber: String(savedCase.caseNumber || '').trim(),
        caseType: String(savedCase.caseType || '').trim(),
        caseYear: String(savedCase.caseYear || '').trim(),
        courtType: String(savedCase.courtType || '').trim(),
        userId: String(savedCase.userId || '').trim(),
      };
      const id = String(savedCase.id || buildSavedCaseId(cleanedCase)).trim();
      const previous = existingById.get(id) || {};
      const requestedSchedule = String(savedCase.schedule || '').trim();
      const schedule = requestedSchedule || previous.schedule || DEFAULT_SCHEDULE;

      let sourceUrl = String(savedCase.sourceUrl || previous.sourceUrl || '').trim();
      let portalId = String(savedCase.portalId || previous.portalId || '').trim();

      if (!sourceUrl && !portalId) {
        const inferred = inferPortalIdForLegacyCase(cleanedCase);
        if (inferred) {
          sourceUrl = inferred.sourceUrl;
          portalId = inferred.portalId;
        }
      }

      if (sourceUrl && !portalId) {
        const matched = matchAdapterByUrl(sourceUrl);
        if (matched) {
          portalId = matched.id;
        }
      } else if (portalId && !getAdapterById(portalId)) {
        portalId = '';
      }

      const status = portalId ? 'active' : 'unsupported_portal';
      const incomingRecipients = Array.isArray(savedCase.recipientIds)
        ? savedCase.recipientIds
        : null;
      const previousRecipients = Array.isArray(previous.recipientIds) ? previous.recipientIds : [];
      const recipientIds = (incomingRecipients || previousRecipients)
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      return {
        ...cleanedCase,
        id,
        lastResult: savedCase.lastResult || previous.lastResult || null,
        lastSnapshot:
          savedCase.lastSnapshot !== undefined
            ? savedCase.lastSnapshot
            : previous.lastSnapshot !== undefined
              ? previous.lastSnapshot
              : null,
        portalId,
        recipientIds,
        schedule,
        sourceUrl,
        status,
      };
    })
    .filter(
      (savedCase) =>
        savedCase.caseNumber && (savedCase.sourceUrl || savedCase.courtType),
    );
}

function resolveRecipients(savedCase, allUsers) {
  const ids = Array.isArray(savedCase.recipientIds) ? savedCase.recipientIds : [];
  if (!ids.length) {
    return [];
  }
  const byId = new Map(allUsers.map((user) => [user.id, user]));
  return ids
    .map((id) => byId.get(id))
    .filter((user) => user && user.email);
}

function buildEmailContext(savedCase) {
  return {
    benchName: getBenchName(savedCase.benchId),
    caseReference: getCaseReference(savedCase),
    courtName: getCourtName(savedCase.courtType),
  };
}

async function notifyCaseUpdate(savedCase, result, users, diff) {
  if (!result || !result.ok) {
    return;
  }

  const recipients = resolveRecipients(savedCase, users);
  if (!recipients.length) {
    return;
  }

  if (!isEmailConfigured()) {
    console.warn(
      `[email] SMTP not configured — would have emailed ${recipients.length} recipient(s) for ${savedCase.id}`,
    );
    return;
  }

  try {
    const emailResult = await sendCaseUpdateEmail({
      changes: diff.changes,
      context: buildEmailContext(savedCase),
      isFirstFetch: diff.isFirstFetch,
      isTestMode: isTestingSchedule(savedCase.schedule) && !diff.isFirstFetch && diff.changes.length === 0,
      recipients,
      result,
      savedCase,
    });
    if (emailResult.ok) {
      console.log(
        `[email] Sent update for ${savedCase.id} to ${emailResult.recipients.join(', ')}`,
      );
    } else {
      console.warn(`[email] Skipped ${savedCase.id}: ${emailResult.reason}`);
    }
  } catch (emailError) {
    console.error(`[email] Failed for ${savedCase.id}: ${emailError.message}`);
  }
}

async function persistCaseResult(savedCase, result, { force = false } = {}) {
  let usersSnapshot = [];
  let diff = { changes: [], isFirstFetch: false };
  const newSnapshot = buildSnapshot(result);

  await withDataLock(async () => {
    const data = await loadAppDataRaw();
    const previousCase = data.savedCases.find((existing) => existing.id === savedCase.id) || {};
    const previousSnapshot = previousCase.lastSnapshot || null;

    if (newSnapshot) {
      diff = diffSnapshots(previousSnapshot, newSnapshot);
    }

    const updatedCases = data.savedCases.map((existing) => {
      if (existing.id !== savedCase.id) {
        return existing;
      }
      return {
        ...existing,
        lastResult: result,
        lastSnapshot: newSnapshot || existing.lastSnapshot || null,
      };
    });
    await saveAppDataRaw({ ...data, savedCases: updatedCases });
    usersSnapshot = data.users;
  });

  if (!result.ok) {
    return;
  }

  const nextHearing = (result.caseStatus && result.caseStatus.nextHearingDate) || '';
  const hearingIsTomorrow = isTomorrowHearing(nextHearing);

  // Email rule: send only when the next hearing date is EXACTLY tomorrow —
  // evaluated on every scheduled run. `force` = a manual per-case Run, which
  // always emails (for testing delivery). Today, later dates, past, or no
  // hearing date → no email.
  if (!force && !hearingIsTomorrow) {
    console.log(
      `[hearing] ${savedCase.id}: next hearing "${nextHearing || 'none'}" is not tomorrow — email skipped`,
    );
    return;
  }

  if (hearingIsTomorrow) {
    console.log(`[hearing] ${savedCase.id}: hearing is tomorrow (${nextHearing}) — sending email`);
  } else if (force) {
    console.log(`[manual] ${savedCase.id}: manual run — emailing current result to recipients`);
  }

  if (diff.changes.length) {
    console.log(`[change] ${savedCase.id}: ${summarizeChanges(diff.changes)}`);
  }

  await notifyCaseUpdate(savedCase, result, usersSnapshot, diff);
}

async function refreshScheduledJobs() {
  const data = await loadAppData();
  syncScheduledJobs(data.savedCases, { onResult: persistCaseResult });
}

const REQUIRED_CASE_KEYS = [
  'sourceUrl',
  'portalId',
  'status',
  'schedule',
  'recipientIds',
  'lastSnapshot',
];

async function migrateAppDataIfNeeded() {
  const data = await loadAppData();
  const migratedCases = sanitizeSavedCases(data.savedCases, data.savedCases);
  const migratedUsers = ensureDefaultAdmin(data.users || []);

  const casesChanged =
    migratedCases.length !== data.savedCases.length ||
    migratedCases.some((next, index) => {
      const previous = data.savedCases[index] || {};
      const missingKey = REQUIRED_CASE_KEYS.some((key) => !(key in previous));
      if (missingKey) {
        return true;
      }
      return (
        next.sourceUrl !== previous.sourceUrl ||
        next.portalId !== previous.portalId ||
        next.status !== previous.status ||
        next.schedule !== previous.schedule
      );
    });

  const usersChanged =
    migratedUsers.length !== data.users.length ||
    migratedUsers.some((next, index) => {
      const previous = data.users[index] || {};
      return (
        next.role !== previous.role ||
        next.id !== previous.id ||
        Boolean(next.passwordHash) !== Boolean(previous.passwordHash)
      );
    });

  const lookupsChangedNeeded = !data.lookups || typeof data.lookups !== 'object';

  if (casesChanged || usersChanged || lookupsChangedNeeded) {
    await saveAppData({
      ...data,
      lookups: data.lookups || EMPTY_LOOKUPS,
      savedCases: migratedCases,
      users: migratedUsers,
    });
    if (casesChanged) {
      console.log('[startup] Migrated saved cases to add new fields');
    }
    if (usersChanged) {
      const adminAdded = !data.users.some((user) => user.role === 'admin');
      if (adminAdded) {
        console.log(
          `[startup] Bootstrapped default admin user — login ID "admin", password "${DEFAULT_ADMIN_PASSWORD}". Change this password right away.`,
        );
      } else {
        console.log('[startup] Migrated users to add role field');
      }
    }
    if (lookupsChangedNeeded) {
      console.log('[startup] Added lookups (schedules/courts/benches/case types) to data file');
    }
  }
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendOptions(response) {
  response.writeHead(204, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
  });
  response.end();
}

async function handleAppDataGet(response) {
  const data = await loadAppData();
  sendJson(response, 200, {
    ...data,
    emailConfigured: isEmailConfigured(),
    logFilePath: getLogFilePath(),
    lookups: data.lookups || EMPTY_LOOKUPS,
    ok: true,
    serverExecPath: process.execPath,
    smtp: publicSmtp(data.smtp),
    users: publicUsers(data.users),
    version: PKG.version,
  });
}

// The client never receives the SMTP password, so a save with a blank password
// means "keep the existing one". A non-empty password replaces it.
function mergeSmtp(incoming, current) {
  const next = normalizeSmtp(incoming);
  const previous = normalizeSmtp(current);
  if (!next.pass) {
    next.pass = previous.pass;
  }
  return next;
}

function smtpChanged(incoming, current) {
  return JSON.stringify(normalizeSmtp(incoming)) !== JSON.stringify(normalizeSmtp(current));
}

function usersListChanged(incoming, current) {
  if (!Array.isArray(incoming)) {
    return false;
  }
  if (incoming.length !== current.length) {
    return true;
  }
  const currentById = new Map(current.map((user) => [user.id, user]));
  return incoming.some((next) => {
    const previous = currentById.get(next.id);
    if (!previous) {
      return true;
    }
    if ('password' in next && next.password !== '') {
      return true;
    }
    return (
      next.email !== previous.email ||
      next.loginId !== previous.loginId ||
      next.name !== previous.name ||
      next.phone !== previous.phone ||
      (next.role && next.role !== previous.role)
    );
  });
}

async function handleAppDataPost(request, response) {
  const body = await readJsonBody(request);
  const currentData = await loadAppData();
  const currentUser = request.authenticatedUser;
  const isAdmin = currentUser && currentUser.role === 'admin';
  const incomingUsers = Array.isArray(body.users) ? body.users : null;
  const incomingLookups = body.lookups && typeof body.lookups === 'object' ? body.lookups : null;

  let nextUsers = currentData.users;
  if (incomingUsers && usersListChanged(incomingUsers, currentData.users)) {
    if (!isAdmin) {
      sendJson(response, 403, {
        code: 'ADMIN_REQUIRED',
        message: 'Only an admin can change the recipient list.',
        ok: false,
      });
      return;
    }
    nextUsers = sanitizeUsers(incomingUsers, currentData.users);
  }

  let nextLookups = currentData.lookups || EMPTY_LOOKUPS;
  if (incomingLookups) {
    const sanitized = sanitizeLookups(incomingLookups);
    if (lookupsChanged(sanitized, nextLookups)) {
      nextLookups = sanitized;
    }
  }

  let nextSmtp = currentData.smtp || EMPTY_SMTP;
  const incomingSmtp = body.smtp && typeof body.smtp === 'object' ? body.smtp : null;
  if (incomingSmtp) {
    const merged = mergeSmtp(incomingSmtp, currentData.smtp);
    if (smtpChanged(merged, nextSmtp)) {
      if (!isAdmin) {
        sendJson(response, 403, {
          code: 'ADMIN_REQUIRED',
          message: 'Only an admin can change email (SMTP) settings.',
          ok: false,
        });
        return;
      }
      nextSmtp = merged;
    }
  }

  // Only touch saved cases when the client actually sent them, so a settings-only
  // save (e.g. SMTP or lookups) never wipes the tracked case list.
  const nextSavedCases = Array.isArray(body.savedCases)
    ? sanitizeSavedCases(body.savedCases, currentData.savedCases)
    : currentData.savedCases;

  const nextData = await saveAppData({
    notifications: currentData.notifications,
    lookups: nextLookups,
    savedCases: nextSavedCases,
    smtp: nextSmtp,
    users: nextUsers,
  });

  applySmtpConfig(nextData.smtp);
  await refreshScheduledJobs();

  sendJson(response, 200, {
    ...nextData,
    lookups: nextData.lookups || EMPTY_LOOKUPS,
    ok: true,
    smtp: publicSmtp(nextData.smtp),
    users: publicUsers(nextData.users),
  });
}

// Full backup: the complete app data (SMTP password, login hashes, cases,
// recipients, schedules) so it can be restored after an update or on another PC.
async function handleExport(request, response) {
  const data = await loadAppData();
  const isAdmin = request.authenticatedUser && request.authenticatedUser.role === 'admin';
  if (hasAnyPasswords(data.users) && !isAdmin) {
    sendJson(response, 403, {
      code: 'ADMIN_REQUIRED',
      message: 'Only an admin can download a backup.',
      ok: false,
    });
    return;
  }
  sendJson(response, 200, {
    exportedAt: new Date().toISOString(),
    lookups: data.lookups || EMPTY_LOOKUPS,
    notifications: data.notifications || [],
    ok: true,
    savedCases: data.savedCases || [],
    smtp: normalizeSmtp(data.smtp),
    users: data.users || [],
    version: 1,
  });
}

// Restore a backup file — replaces all app data with its contents.
async function handleImport(request, response) {
  const body = await readJsonBody(request);
  const currentData = await loadAppData();
  const isAdmin = request.authenticatedUser && request.authenticatedUser.role === 'admin';
  if (hasAnyPasswords(currentData.users) && !isAdmin) {
    sendJson(response, 403, {
      code: 'ADMIN_REQUIRED',
      message: 'Only an admin can restore a backup.',
      ok: false,
    });
    return;
  }

  const incoming = body && typeof body === 'object' ? body : {};
  if (!Array.isArray(incoming.savedCases) && !Array.isArray(incoming.users)) {
    sendJson(response, 400, {
      message: 'That file is not a valid CaseCue backup.',
      ok: false,
    });
    return;
  }

  const importedUsers = ensureDefaultAdmin(
    Array.isArray(incoming.users) ? incoming.users.map(sanitizeImportedUser) : [],
  );
  const saved = await saveAppData({
    lookups: sanitizeLookups(incoming.lookups || {}),
    notifications: Array.isArray(incoming.notifications) ? incoming.notifications : [],
    savedCases: sanitizeSavedCases(Array.isArray(incoming.savedCases) ? incoming.savedCases : [], []),
    smtp: normalizeSmtp(incoming.smtp),
    users: importedUsers,
  });

  applySmtpConfig(saved.smtp);
  await refreshScheduledJobs();

  console.log(
    `[import] Restored backup — ${saved.savedCases.length} case(s), ${saved.users.length} user(s), SMTP ${saved.smtp.host ? 'set' : 'empty'}`,
  );

  sendJson(response, 200, {
    imported: {
      cases: saved.savedCases.length,
      smtpConfigured: Boolean(saved.smtp.host && saved.smtp.user),
      users: saved.users.length,
    },
    ok: true,
  });
}

async function handleAuthStatus(request, response) {
  const data = await loadAppData();
  const loginRequired = hasAnyPasswords(data.users);
  const token = extractBearerToken(request);
  const session = token ? validateToken(token) : null;
  const authenticatedUser =
    session && data.users.find((user) => user.id === session.userId);

  sendJson(response, 200, {
    authenticated: Boolean(authenticatedUser) || !loginRequired,
    defaultAdminPasswordInUse: isUsingDefaultAdminPassword(data.users),
    loginRequired,
    ok: true,
    user: authenticatedUser ? publicUsers([authenticatedUser])[0] : null,
  });
}

function findUserByUsername(users, username) {
  const lookup = String(username || '').trim().toLowerCase();
  if (!lookup) {
    return null;
  }
  const phoneDigits = lookup.replace(/\D/g, '');

  return (
    users.find(
      (candidate) =>
        (candidate.email && candidate.email.toLowerCase() === lookup) ||
        (candidate.loginId && candidate.loginId.toLowerCase() === lookup) ||
        (candidate.phone && phoneDigits && candidate.phone.replace(/\D/g, '') === phoneDigits),
    ) || null
  );
}

async function handleAuthLogin(request, response) {
  const body = await readJsonBody(request);
  const username = String(body.username || body.loginId || '').trim();
  const password = String(body.password || '');

  if (!username || !password) {
    sendJson(response, 400, {
      message: 'Email or phone and password are required.',
      ok: false,
    });
    return;
  }

  const data = await loadAppData();
  const user = findUserByUsername(data.users, username);

  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    console.warn(`[auth] Failed login attempt for "${username}"`);
    sendJson(response, 401, {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials.',
      ok: false,
    });
    return;
  }

  console.log(`[auth] Login OK: ${user.name} (${user.loginId || user.email})`);
  const token = createSession(user.id);
  sendJson(response, 200, {
    ok: true,
    token,
    user: publicUsers([user])[0],
  });
}

async function handleAuthChangePassword(request, response) {
  const body = await readJsonBody(request);
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');

  if (!newPassword || newPassword.length < 4) {
    sendJson(response, 400, {
      message: 'New password must be at least 4 characters.',
      ok: false,
    });
    return;
  }

  const user = request.authenticatedUser;
  if (!user) {
    sendJson(response, 401, { message: 'Authentication required.', ok: false });
    return;
  }

  const data = await loadAppData();
  const fullUser = data.users.find((candidate) => candidate.id === user.id);
  if (!fullUser || !fullUser.passwordHash || !verifyPassword(currentPassword, fullUser.passwordHash)) {
    sendJson(response, 401, {
      code: 'INVALID_CREDENTIALS',
      message: 'Current password is incorrect.',
      ok: false,
    });
    return;
  }

  const updatedUsers = data.users.map((candidate) =>
    candidate.id === user.id ? { ...candidate, passwordHash: hashPassword(newPassword) } : candidate,
  );
  await saveAppData({ ...data, users: updatedUsers });

  sendJson(response, 200, { ok: true });
}

async function handleAuthLogout(request, response) {
  const token = extractBearerToken(request);
  revokeToken(token);
  sendJson(response, 200, { ok: true });
}

async function handleNotificationsGet(response) {
  const data = await loadAppData();
  sendJson(response, 200, {
    notifications: data.notifications,
    ok: true,
  });
}

async function handleSchedulerRun(request, response) {
  await readJsonBody(request);
  const data = await loadAppData();
  const results = await runAllCasesNow(data.savedCases, { onResult: persistCaseResult });
  const okCount = results.filter((item) => item.ok).length;
  const failedCount = results.filter((item) => !item.ok && !item.skipped).length;
  const skippedCount = results.filter((item) => item.skipped).length;

  sendJson(response, 200, {
    checkedCount: results.length,
    createdCount: okCount,
    failedCount,
    ok: true,
    ranAt: new Date().toISOString(),
    results,
    skippedCount,
    targetDate: 'now',
  });
}

async function handleSchedulerRunOne(request, response) {
  const body = await readJsonBody(request);
  const caseId = String(body.caseId || '').trim();
  if (!caseId) {
    sendJson(response, 400, { message: 'caseId is required.', ok: false });
    return;
  }

  const data = await loadAppData();
  const savedCase = data.savedCases.find((existing) => existing.id === caseId);
  if (!savedCase) {
    sendJson(response, 404, { message: 'Case not found.', ok: false });
    return;
  }

  // Run only this case, and force-email its current result to its recipients.
  const result = await runCaseFetch(savedCase, {
    onResult: (sc, res) => persistCaseResult(sc, res, { force: true }),
  });

  sendJson(response, 200, {
    caseId,
    emailed: Boolean(result.ok && (savedCase.recipientIds || []).length && isEmailConfigured()),
    error: result.error || '',
    ok: Boolean(result.ok),
    ranAt: new Date().toISOString(),
    skipped: Boolean(result.skipped),
  });
}

async function handleSchedulerState(response) {
  sendJson(response, 200, {
    defaultSchedule: DEFAULT_SCHEDULE,
    jobs: listScheduledJobs(),
    ok: true,
  });
}

async function handlePortalsGet(response) {
  sendJson(response, 200, {
    ok: true,
    portals: listAdapters(),
  });
}

async function handleEmailTest(request, response) {
  const body = await readJsonBody(request);
  const toEmail = String(body.to || '').trim();

  if (!toEmail) {
    sendJson(response, 400, {
      message: 'Provide a "to" email address in the request body.',
      ok: false,
    });
    return;
  }

  if (!isEmailConfigured()) {
    sendJson(response, 400, {
      message: 'SMTP is not configured. Add your host, username and password in Settings → Email (SMTP) settings.',
      ok: false,
    });
    return;
  }

  const result = await sendTestEmail(toEmail);
  sendJson(response, 200, result);
}

async function handleNclatBenchesGet(response) {
  const { listNclatBenches } = require('./nclat-fetcher');
  sendJson(response, 200, { benches: listNclatBenches(), ok: true });
}

async function handleNclatCaseTypesGet(response) {
  const { listNclatCaseTypes } = require('./nclat-fetcher');
  sendJson(response, 200, { caseTypes: listNclatCaseTypes(), ok: true });
}

async function handleNcltBenchesGet(response) {
  const { listNcltBenches } = require('./nclt-fetcher');
  sendJson(response, 200, { benches: listNcltBenches(), ok: true });
}

async function handleNcltCaseTypesGet(response) {
  const { listNcltCaseTypes } = require('./nclt-fetcher');
  sendJson(response, 200, { caseTypes: listNcltCaseTypes(), ok: true });
}

async function handleDrtBenchesGet(response) {
  const { listDrtBenches } = require('./drt-fetcher');
  try {
    const benches = await listDrtBenches();
    sendJson(response, 200, { benches, ok: true });
  } catch (error) {
    sendJson(response, 502, { message: error.message, ok: false });
  }
}

async function handleDrtCaseTypesGet(response, url) {
  const { listDrtCaseTypes } = require('./drt-fetcher');
  const schemeNameDrtId = url.searchParams.get('bench') || url.searchParams.get('schemeNameDrtId');
  if (!schemeNameDrtId) {
    sendJson(response, 400, {
      message: 'Provide a bench ID via ?bench= or ?schemeNameDrtId=',
      ok: false,
    });
    return;
  }
  try {
    const caseTypes = await listDrtCaseTypes(schemeNameDrtId);
    sendJson(response, 200, { caseTypes, ok: true });
  } catch (error) {
    sendJson(response, 502, { message: error.message, ok: false });
  }
}

async function handleUnsupportedRequestsGet(response) {
  const data = await loadAppData();
  const unsupported = data.savedCases
    .filter((savedCase) => savedCase.status === 'unsupported_portal')
    .map((savedCase) => ({
      caseId: savedCase.id,
      caseNumber: savedCase.caseNumber,
      courtType: savedCase.courtType || '',
      sourceUrl: savedCase.sourceUrl || '',
      userId: savedCase.userId || '',
    }));

  sendJson(response, 200, {
    count: unsupported.length,
    ok: true,
    requests: unsupported,
  });
}

async function handleCaptcha(request, response, url) {
  pruneSessions();
  const session = getSession(url.searchParams.get('sessionId'));
  await ensureCourtSession(session);

  const courtResponse = await courtFetch(session, `/captcha.php?t=${Date.now()}`, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: `${COURT_BASE_URL}/casemenu.php`,
    },
  });

  if (!courtResponse.ok) {
    throw new Error(`Court captcha returned ${courtResponse.status}`);
  }

  const buffer = Buffer.from(await courtResponse.arrayBuffer());
  const contentType = detectImageContentType(
    buffer,
    courtResponse.headers.get('content-type') || 'image/jpeg',
  );
  sendJson(response, 200, {
    contentType,
    imageDataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
    sessionId: session.id,
  });
}

async function handleCaseTypes(response) {
  const session = getSession();
  const courtResponse = await courtFetch(session, '/loadcasetype.php', {
    body: new URLSearchParams({ type: 'H' }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${COURT_BASE_URL}/casemenu.php`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    method: 'POST',
  });

  if (!courtResponse.ok) {
    throw new Error(`Court case-type endpoint returned ${courtResponse.status}`);
  }

  const html = await courtResponse.text();
  sendJson(response, 200, {
    caseTypes: parseOptions(html),
  });
}

async function handleCaseStatus(request, response) {
  const body = await readJsonBody(request);
  const session = getSession(body.sessionId);
  const courtType = String(body.courtType || 'highCourtKarnataka').trim();
  const bench = String(body.bench || 'B').trim();
  const caseType = String(body.caseType || '').trim().toUpperCase();
  const caseNumber = String(body.caseNumber || '').trim();
  const caseYear = String(body.caseYear || '').trim();
  const captcha = String(body.captcha || '').trim();

  if (courtType !== 'highCourtKarnataka') {
    sendJson(response, 501, {
      code: 'COURT_NOT_CONNECTED',
      message:
        'Live lookup is currently connected for Karnataka High Court only. NCLT and DRT cases can be saved locally while their portal adapters are added.',
      ok: false,
    });
    return;
  }

  if (!caseType || !caseNumber || !caseYear || !captcha) {
    sendJson(response, 400, {
      message: 'Bench, case type, case number, case year, and captcha are required.',
      ok: false,
    });
    return;
  }

  await ensureCourtSession(session);

  const courtResponse = await courtFetch(session, '/casestatus.php', {
    body: new URLSearchParams({
      benchval: `${bench}*${caseType}*${caseNumber}*${caseYear}*${captcha}`,
    }),
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: COURT_BASE_URL,
      Referer: `${COURT_BASE_URL}/casemenu.php`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    method: 'POST',
  });

  if (!courtResponse.ok) {
    throw new Error(`Court case-status endpoint returned ${courtResponse.status}`);
  }

  const html = await courtResponse.text();
  if (html.trim() === '2') {
    sendJson(response, 400, {
      code: 'INVALID_CAPTCHA',
      message: 'Invalid captcha. Refresh the captcha and try again.',
      ok: false,
    });
    return;
  }

  const caseStatus = parseCaseStatus(html);
  sendJson(response, 200, {
    caseStatus,
    ok: true,
    source: `${COURT_BASE_URL}/casestatus.php`,
  });
}

const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/status',
  '/api/health',
]);

async function ensureAuthenticated(request, response, url) {
  const token = extractBearerToken(request);
  const session = token ? validateToken(token) : null;

  if (session) {
    const data = await loadAppData();
    const user = data.users.find((candidate) => candidate.id === session.userId);
    if (user) {
      request.authenticatedUser = publicUsers([user])[0];
    }
  }

  if (PUBLIC_PATHS.has(url.pathname)) {
    return true;
  }

  const data = await loadAppData();
  if (!hasAnyPasswords(data.users)) {
    return true;
  }

  if (!request.authenticatedUser) {
    sendJson(response, 401, {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required.',
      ok: false,
    });
    return false;
  }

  return true;
}

async function route(request, response) {
  if (request.method === 'OPTIONS') {
    sendOptions(response);
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  // Log every API call (except the frequent health ping) for activity tracing.
  if (url.pathname !== '/api/health') {
    console.log(`[api] ${request.method} ${url.pathname}`);
  }

  try {
    const authed = await ensureAuthenticated(request, response, url);
    if (!authed) {
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true });
    } else if (request.method === 'GET' && url.pathname === '/api/auth/status') {
      await handleAuthStatus(request, response);
    } else if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      await handleAuthLogin(request, response);
    } else if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      await handleAuthLogout(request, response);
    } else if (request.method === 'POST' && url.pathname === '/api/auth/change-password') {
      await handleAuthChangePassword(request, response);
    } else if (request.method === 'GET' && url.pathname === '/api/app-data') {
      await handleAppDataGet(response);
    } else if (request.method === 'POST' && url.pathname === '/api/app-data') {
      await handleAppDataPost(request, response);
    } else if (request.method === 'GET' && url.pathname === '/api/export') {
      await handleExport(request, response);
    } else if (request.method === 'POST' && url.pathname === '/api/import') {
      await handleImport(request, response);
    } else if (request.method === 'GET' && url.pathname === '/api/notifications') {
      await handleNotificationsGet(response);
    } else if (request.method === 'POST' && url.pathname === '/api/scheduler/run') {
      await handleSchedulerRun(request, response);
    } else if (request.method === 'POST' && url.pathname === '/api/scheduler/run-one') {
      await handleSchedulerRunOne(request, response);
    } else if (request.method === 'GET' && url.pathname === '/api/scheduler/state') {
      await handleSchedulerState(response);
    } else if (request.method === 'GET' && url.pathname === '/api/portals') {
      await handlePortalsGet(response);
    } else if (request.method === 'GET' && url.pathname === '/api/unsupported-requests') {
      await handleUnsupportedRequestsGet(response);
    } else if (request.method === 'GET' && url.pathname === '/api/drt/benches') {
      await handleDrtBenchesGet(response);
    } else if (request.method === 'GET' && url.pathname === '/api/drt/case-types') {
      await handleDrtCaseTypesGet(response, url);
    } else if (request.method === 'GET' && url.pathname === '/api/nclat/benches') {
      await handleNclatBenchesGet(response);
    } else if (request.method === 'GET' && url.pathname === '/api/nclat/case-types') {
      await handleNclatCaseTypesGet(response);
    } else if (request.method === 'GET' && url.pathname === '/api/nclt/benches') {
      await handleNcltBenchesGet(response);
    } else if (request.method === 'GET' && url.pathname === '/api/nclt/case-types') {
      await handleNcltCaseTypesGet(response);
    } else if (request.method === 'POST' && url.pathname === '/api/email/test') {
      await handleEmailTest(request, response);
    } else if (request.method === 'GET' && url.pathname === '/api/captcha') {
      await handleCaptcha(request, response, url);
    } else if (request.method === 'GET' && url.pathname === '/api/case-types') {
      await handleCaseTypes(response);
    } else if (request.method === 'POST' && url.pathname === '/api/case-status') {
      await handleCaseStatus(request, response);
    } else {
      sendJson(response, 404, { message: 'Not found', ok: false });
    }
  } catch (error) {
    console.error(`[api] ${request.method} ${url.pathname} failed: ${error && error.stack ? error.stack : error}`);
    sendJson(response, 500, {
      message: error.message || 'Live court lookup failed.',
      ok: false,
    });
  }
}

async function start() {
  // Log the version + install path on every boot — the fastest way to confirm
  // which build is actually running (check %APPDATA%/casecue/logs/casecue.log).
  console.log(`[startup] CaseCue v${PKG.version} — running from ${process.execPath}`);

  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => undefined);
  await migrateAppDataIfNeeded();

  const startupData = await loadAppData();
  applySmtpConfig(startupData.smtp);

  await refreshScheduledJobs();

  if (!process.env.TWOCAPTCHA_API_KEY) {
    console.log(
      '[startup] Captcha solver: Tesseract OCR (free, local) — 2Captcha fallback disabled. Karnataka HC: ~95% success. eCourts (Securimage): ~50-70% per attempt, 3 retries built in. Add TWOCAPTCHA_API_KEY in server/.env for the harder captchas.',
    );
  } else {
    console.log('[startup] Captcha solver: Tesseract OCR (primary), 2Captcha (fallback for low-confidence captchas)');
  }

  if (!isEmailConfigured()) {
    console.warn(
      '[startup] SMTP not configured — successful fetches will not be emailed. Add email settings in the app (Settings → Email (SMTP) settings), or set SMTP_HOST/SMTP_USER/SMTP_PASS in server/.env.',
    );
  } else {
    const s = getSmtpSummary();
    console.log(
      `[startup] SMTP configured — ${s.user} via ${s.host}:${s.port} (from ${s.from}, source: ${s.source})`,
    );
  }

  const server = http.createServer(route);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `\n[startup] Port ${PORT} is already in use — another CaseCue server is probably still running.\n` +
          `         Run "npm run kill-server" to free the port, then try again.\n`,
      );
      process.exit(1);
    }
    throw error;
  });

  server.listen(PORT, () => {
    console.log(`Live court proxy running at http://localhost:${PORT}`);
    console.log(`Default schedule: "${DEFAULT_SCHEDULE}" (8 AM and 6 PM local time)`);
    const logPath = getLogFilePath();
    if (logPath) {
      console.log(`[startup] Activity log: ${logPath}`);
    }
  });
}

start().catch((error) => {
  console.error(`Server failed to start: ${error.message}`);
  process.exit(1);
});

module.exports = {
  getCaseReference,
  getCourtName,
  getBenchName,
  DRT_REFERENCE_CASES,
  normalizeCaseNumber,
};
