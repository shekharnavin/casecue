const crypto = require('node:crypto');

const { solveCaptcha } = require('./captcha-solver');

const ECOURTS_BASE = 'https://services.ecourts.gov.in';
const ECOURTS_HOME = '/ecourtindia_v6/?p=home/index';
const ECOURTS_CAPTCHA = '/ecourtindia_v6/vendor/securimage/securimage_show.php';
const ECOURTS_SEARCH = '/ecourtindia_v6/?p=cnr_status/searchByCNR/';

const SESSION_TTL_MS = 20 * 60 * 1000;
const DEFAULT_MAX_CAPTCHA_ATTEMPTS = 3;
const CAPTCHA_LENGTH = 6;

const sessions = new Map();

function getSession(sessionId) {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const id = crypto.randomUUID();
  const session = {
    appToken: '',
    cookies: new Map(),
    id,
    updatedAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

function pruneSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.updatedAt < cutoff) {
      sessions.delete(id);
    }
  }
}

function splitSetCookie(headerValue) {
  if (!headerValue) {
    return [];
  }
  if (Array.isArray(headerValue)) {
    return headerValue;
  }
  return String(headerValue).split(/,(?=\s*[^;,=\s]+=[^;,]*)/g);
}

function updateCookies(session, response) {
  const headerList =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : splitSetCookie(response.headers.get('set-cookie'));

  for (const cookieLine of headerList) {
    const [cookiePair] = cookieLine.split(';');
    const eqIndex = cookiePair.indexOf('=');
    if (eqIndex > 0) {
      session.cookies.set(
        cookiePair.slice(0, eqIndex).trim(),
        cookiePair.slice(eqIndex + 1).trim(),
      );
    }
  }
}

function cookieHeader(session) {
  return Array.from(session.cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function ecourtsFetch(session, requestPath, options = {}) {
  const headers = {
    Accept: '*/*',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    ...options.headers,
  };
  const cookies = cookieHeader(session);
  if (cookies) {
    headers.Cookie = cookies;
  }

  const response = await fetch(`${ECOURTS_BASE}${requestPath}`, {
    ...options,
    headers,
    redirect: 'manual',
  });
  updateCookies(session, response);
  session.updatedAt = Date.now();
  return response;
}

async function ensureSession(session) {
  if (session.loadedHomePage && session.appToken !== '') {
    return;
  }

  const response = await ecourtsFetch(session, ECOURTS_HOME, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`eCourts home page returned ${response.status}`);
  }

  const html = await response.text();
  const tokenMatch =
    html.match(/id\s*=\s*['"]app_token['"][^>]*value\s*=\s*['"]([^'"]*)['"]/i) ||
    html.match(/name\s*=\s*['"]app_token['"][^>]*value\s*=\s*['"]([^'"]*)['"]/i);

  session.appToken = (tokenMatch && tokenMatch[1]) || '';
  session.loadedHomePage = true;
}

async function fetchCaptchaImage(session) {
  const response = await ecourtsFetch(session, `${ECOURTS_CAPTCHA}?${Date.now()}`, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: `${ECOURTS_BASE}${ECOURTS_HOME}`,
    },
  });

  if (!response.ok) {
    throw new Error(`eCourts captcha returned ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function submitCNRQuery(session, { captcha, cnr }) {
  const body = new URLSearchParams({
    ajax_req: 'true',
    app_token: session.appToken || '',
    cino: cnr,
    fcaptcha_code: captcha,
  });

  const response = await ecourtsFetch(session, ECOURTS_SEARCH, {
    body,
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: ECOURTS_BASE,
      Referer: `${ECOURTS_BASE}${ECOURTS_HOME}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`eCourts search endpoint returned ${response.status}`);
  }

  const raw = await response.text();

  // csrf-magic appends a token marker after the JSON; try to be resilient.
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/^(\{[\s\S]*?\})\s*[\r\n]?\s*$/);
    if (match) {
      try {
        parsed = JSON.parse(match[1]);
      } catch {
        /* fall through */
      }
    }
  }

  if (!parsed) {
    return { code: 'INVALID_RESPONSE', ok: false, raw };
  }

  // Track the rotating CSRF token if eCourts returned a new one.
  if (parsed.app_token) {
    session.appToken = parsed.app_token;
  }

  return { json: parsed, ok: true };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html) {
  return decodeHtml(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|tr|td|th|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\r\f\v]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{2,}/g, '\n'),
  ).trim();
}

function cleanValue(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/^[:\-]\s*/, '').trim();
}

function extractField(text, label, nextLabels) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedNext = nextLabels
    .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(
    `${escapedLabel}\\s*[:\\-]?\\s*([\\s\\S]*?)(?=${escapedNext}|$)`,
    'i',
  );
  const match = text.match(pattern);
  return match ? cleanValue(match[1]) : '';
}

function parseCaseDetails(html) {
  const text = htmlToText(html);
  const labels = [
    'Case Type',
    'Filing Number',
    'Filing Date',
    'Registration Number',
    'Registration Date',
    'CNR Number',
    'First Hearing Date',
    'Decision Date',
    'Case Status',
    'Nature of Disposal',
    'Court Number and Judge',
    'Petitioner and Advocate',
    'Respondent and Advocate',
    'Under Act(s)',
    'Under Section(s)',
    'Acts',
    'Sections',
    'IA Number',
    'IA Status',
    'IA Filing Date',
    'Next Hearing Date',
    'Case Stage',
    'Court Number',
    'Causelist Type',
    'Judge',
    'History of Case Hearing',
  ];

  function pick(label) {
    return extractField(text, label, labels.filter((item) => item !== label));
  }

  const status = pick('Case Status') || pick('Case Stage');

  return {
    caseNumber: pick('Filing Number') || pick('CNR Number'),
    classification: '',
    cnrNumber: pick('CNR Number'),
    dateOfDecision: pick('Decision Date'),
    filingDate: pick('Filing Date'),
    filingNumber: pick('Filing Number'),
    judge: pick('Court Number and Judge') || pick('Judge') || pick('Court Number'),
    lastActionTaken: pick('Nature of Disposal'),
    lastPostedFor: pick('Case Stage') || pick('Causelist Type'),
    nextHearingDate: pick('Next Hearing Date') || pick('First Hearing Date'),
    petitioner: pick('Petitioner and Advocate'),
    petitionerAdvocate: '',
    rawText: text,
    respondent: pick('Respondent and Advocate'),
    respondentAdvocate: '',
    status,
  };
}

function normalizeCnr(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

async function fetchECourtsCase(savedCase, options = {}) {
  const maxCaptchaAttempts = options.maxCaptchaAttempts || DEFAULT_MAX_CAPTCHA_ATTEMPTS;
  const cnr = normalizeCnr(savedCase.cnr || savedCase.caseNumber);

  if (cnr.length !== 16) {
    return {
      error: `eCourts requires a 16-character CNR (got "${cnr}", length ${cnr.length}). Enter the CNR in the case-number field.`,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  pruneSessions();
  const session = getSession();

  try {
    await ensureSession(session);
  } catch (sessionError) {
    return {
      error: `Could not open eCourts session: ${sessionError.message}`,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  let lastError = '';
  for (let attempt = 1; attempt <= maxCaptchaAttempts; attempt += 1) {
    try {
      const captchaImage = await fetchCaptchaImage(session);
      const captchaText = await solveCaptcha(captchaImage, {
        maxLength: CAPTCHA_LENGTH,
        minLength: CAPTCHA_LENGTH,
        numeric: false,
      });

      const submission = await submitCNRQuery(session, { captcha: captchaText, cnr });

      if (!submission.ok) {
        lastError = `eCourts returned an unrecognized response (attempt ${attempt})`;
        // Force a new session/token next attempt
        session.loadedHomePage = false;
        session.appToken = '';
        await ensureSession(session);
        continue;
      }

      const payload = submission.json || {};
      // status === 0 typically means captcha failed
      if (payload.status === 0 || payload.status === '0') {
        lastError = 'Captcha rejected by eCourts';
        continue;
      }

      const html = payload.casetype_list || payload.case_history || payload.results || '';
      if (!html) {
        lastError = 'eCourts accepted the captcha but returned no case data — CNR may not exist.';
        return {
          attempt,
          error: lastError,
          fetchedAt: new Date().toISOString(),
          ok: false,
          rawResponse: payload,
        };
      }

      const caseStatus = parseCaseDetails(html);
      return {
        attempt,
        caseStatus,
        fetchedAt: new Date().toISOString(),
        ok: true,
        source: `${ECOURTS_BASE}${ECOURTS_HOME}`,
      };
    } catch (attemptError) {
      lastError = attemptError.message;
    }
  }

  return {
    attempts: maxCaptchaAttempts,
    error: lastError || 'Unknown failure after captcha retries',
    fetchedAt: new Date().toISOString(),
    ok: false,
  };
}

module.exports = { fetchECourtsCase, normalizeCnr };
