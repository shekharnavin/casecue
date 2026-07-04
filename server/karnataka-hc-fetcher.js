const {
  COURT_BASE_URL,
  courtFetch,
  ensureCourtSession,
  getSession,
} = require('./court-client');
const { parseCaseStatus } = require('./court-parser');
const { solveCaptcha } = require('./captcha-solver');

const DEFAULT_MAX_CAPTCHA_ATTEMPTS = 3;

async function fetchCaptchaImage(session) {
  const response = await courtFetch(session, `/captcha.php?t=${Date.now()}`, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: `${COURT_BASE_URL}/casemenu.php`,
    },
  });

  if (!response.ok) {
    throw new Error(`Court captcha returned ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function submitCaseStatus(session, { bench, captcha, caseNumber, caseType, caseYear }) {
  const response = await courtFetch(session, '/casestatus.php', {
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

  if (!response.ok) {
    throw new Error(`Court case-status endpoint returned ${response.status}`);
  }

  const html = await response.text();
  if (html.trim() === '2') {
    return { code: 'INVALID_CAPTCHA', html, ok: false };
  }

  return { html, ok: true };
}

async function fetchKarnatakaHCCase(savedCase, options = {}) {
  const maxCaptchaAttempts = options.maxCaptchaAttempts || DEFAULT_MAX_CAPTCHA_ATTEMPTS;
  const bench = String(savedCase.benchId || '').trim();
  const caseType = String(savedCase.caseType || '').trim().toUpperCase();
  const caseNumber = String(savedCase.caseNumber || '').trim();
  const caseYear = String(savedCase.caseYear || '').trim();

  if (!bench || !caseType || !caseNumber || !caseYear) {
    return {
      error: 'Saved case is missing bench, type, number, or year.',
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  const session = getSession();

  try {
    await ensureCourtSession(session);
  } catch (sessionError) {
    return {
      error: `Could not open court session: ${sessionError.message}`,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  let lastError = '';
  for (let attempt = 1; attempt <= maxCaptchaAttempts; attempt += 1) {
    try {
      const captchaImage = await fetchCaptchaImage(session);
      const captchaText = await solveCaptcha(captchaImage, {
        maxLength: 8,
        minLength: 4,
        numeric: true,
      });
      const submission = await submitCaseStatus(session, {
        bench,
        captcha: captchaText,
        caseNumber,
        caseType,
        caseYear,
      });

      if (!submission.ok && submission.code === 'INVALID_CAPTCHA') {
        lastError = 'Captcha rejected by court site';
        continue;
      }

      const caseStatus = parseCaseStatus(submission.html);
      return {
        attempt,
        caseStatus,
        fetchedAt: new Date().toISOString(),
        ok: true,
        source: `${COURT_BASE_URL}/casestatus.php`,
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

module.exports = { fetchKarnatakaHCCase };
