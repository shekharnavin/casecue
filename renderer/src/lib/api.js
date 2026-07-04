import { clearAuthToken, getAuthToken } from './auth.js';

const API_BASE =
  (typeof window !== 'undefined' && window.casecue && window.casecue.apiBase) ||
  'http://localhost:4005';

export class ApiError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 && payload.code === 'AUTH_REQUIRED') {
    clearAuthToken();
    throw new ApiError('Session expired. Please sign in again.', {
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  }

  if (!response.ok || payload.ok === false) {
    throw new ApiError(payload.message || `Request failed (${response.status})`, {
      code: payload.code,
      status: response.status,
    });
  }

  return payload;
}

export function fetchAuthStatus() {
  return request('/api/auth/status');
}

export function login(username, password) {
  return request('/api/auth/login', {
    body: JSON.stringify({ password, username }),
    method: 'POST',
  });
}

export function logout() {
  return request('/api/auth/logout', { method: 'POST' });
}

export function changePassword(currentPassword, newPassword) {
  return request('/api/auth/change-password', {
    body: JSON.stringify({ currentPassword, newPassword }),
    method: 'POST',
  });
}

export function fetchAppData() {
  return request('/api/app-data');
}

export function saveAppData({ savedCases, users }) {
  return request('/api/app-data', {
    body: JSON.stringify({ savedCases, users }),
    method: 'POST',
  });
}

export function saveSmtpSettings(smtp) {
  return request('/api/app-data', {
    body: JSON.stringify({ smtp }),
    method: 'POST',
  });
}

export function fetchPortals() {
  return request('/api/portals');
}

export function fetchSchedulerState() {
  return request('/api/scheduler/state');
}

export function runSchedulerNow() {
  return request('/api/scheduler/run', {
    body: JSON.stringify({}),
    method: 'POST',
  });
}

export function fetchUnsupportedRequests() {
  return request('/api/unsupported-requests');
}

export function sendEmailTest(toEmail) {
  return request('/api/email/test', {
    body: JSON.stringify({ to: toEmail }),
    method: 'POST',
  });
}

export function fetchDrtBenches() {
  return request('/api/drt/benches');
}

export function fetchDrtCaseTypes(schemeNameDrtId) {
  return request(`/api/drt/case-types?bench=${encodeURIComponent(schemeNameDrtId)}`);
}

export function fetchNclatBenches() {
  return request('/api/nclat/benches');
}

export function fetchNclatCaseTypes() {
  return request('/api/nclat/case-types');
}

export function fetchNcltBenches() {
  return request('/api/nclt/benches');
}

export function fetchNcltCaseTypes() {
  return request('/api/nclt/case-types');
}
