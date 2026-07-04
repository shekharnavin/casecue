const TOKEN_KEY = 'casecue.authToken';

const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function write(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getAuthToken() {
  return read();
}

export function setAuthToken(token) {
  write(token || '');
  for (const listener of listeners) {
    listener(token || '');
  }
}

export function clearAuthToken() {
  setAuthToken('');
}

export function subscribeAuth(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
