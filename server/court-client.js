const crypto = require('node:crypto');

const COURT_BASE_URL = 'https://judiciary.karnataka.gov.in';
const SESSION_TTL_MS = 20 * 60 * 1000;

const sessions = new Map();

function getSession(sessionId) {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const id = crypto.randomUUID();
  const session = {
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

async function courtFetch(session, requestPath, options = {}) {
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

  const response = await fetch(`${COURT_BASE_URL}${requestPath}`, {
    ...options,
    headers,
    redirect: 'manual',
  });
  updateCookies(session, response);
  session.updatedAt = Date.now();
  return response;
}

async function ensureCourtSession(session) {
  if (session.loadedCourtPage) {
    return;
  }

  const response = await courtFetch(session, '/casemenu.php', {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Court site returned ${response.status} while opening case menu`);
  }

  await response.arrayBuffer();
  session.loadedCourtPage = true;
}

function detectImageContentType(buffer, fallback) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  if (buffer.length >= 6 && buffer.toString('ascii', 0, 6).startsWith('GIF')) {
    return 'image/gif';
  }

  return fallback || 'image/jpeg';
}

module.exports = {
  COURT_BASE_URL,
  courtFetch,
  detectImageContentType,
  ensureCourtSession,
  getSession,
  pruneSessions,
};
