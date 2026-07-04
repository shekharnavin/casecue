const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const sessions = new Map();

function hashPassword(plaintext) {
  if (!plaintext) {
    return '';
  }
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(String(plaintext), salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

function verifyPassword(plaintext, hash) {
  if (!hash || !plaintext) {
    return false;
  }
  const parts = String(hash).split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expectedKey = Buffer.from(parts[2], 'hex');
    const actualKey = scryptSync(String(plaintext), salt, expectedKey.length);
    return timingSafeEqual(expectedKey, actualKey);
  } catch {
    return false;
  }
}

function hasAnyPasswords(users) {
  return Array.isArray(users) && users.some((user) => user && user.passwordHash);
}

function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS, userId });
  return token;
}

function validateToken(token) {
  if (!token) {
    return null;
  }
  const session = sessions.get(token);
  if (!session) {
    return null;
  }
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function revokeToken(token) {
  if (token) {
    sessions.delete(token);
  }
}

function extractBearerToken(request) {
  const header = request.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return '';
  }
  return header.slice(7).trim();
}

module.exports = {
  createSession,
  extractBearerToken,
  hashPassword,
  hasAnyPasswords,
  revokeToken,
  validateToken,
  verifyPassword,
};
