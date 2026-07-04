const NCLAT_BASE = 'https://nclat.nic.in';
const NCLAT_FORM_PATH = '/display-board/cases';
const NCLAT_SEARCH_PATH = '/display-board/cases_details';
const NCLAT_DETAIL_PATH = '/display-board/view_details';

// NCLAT case types as exposed by the search dropdown.
const NCLAT_CASE_TYPES = [
  { id: '32', name: 'Company Appeal(AT)' },
  { id: '33', name: 'Company Appeal(AT)(Ins)' },
  { id: '34', name: 'Competition Appeal(AT)' },
  { id: '35', name: 'Interlocutory Application' },
  { id: '36', name: 'Compensation Application' },
  { id: '37', name: 'Contempt Case(AT)' },
  { id: '38', name: 'Review Application' },
  { id: '39', name: 'Restoration Application' },
  { id: '40', name: 'Transfer Appeal' },
  { id: '61', name: 'Transfer Original Petition (MRTP-AT)' },
];

const NCLAT_LOCATIONS = [
  { id: 'delhi', name: 'New Delhi (Principal Bench)' },
  { id: 'chennai', name: 'Chennai Bench' },
];

const SESSION_TTL_MS = 20 * 60 * 1000;
let cachedSession = null;

function splitSetCookie(headerValue) {
  if (!headerValue) {
    return [];
  }
  if (Array.isArray(headerValue)) {
    return headerValue;
  }
  return String(headerValue).split(/,(?=\s*[^;,=\s]+=[^;,]*)/g);
}

function applyCookies(session, response) {
  const headerList =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : splitSetCookie(response.headers.get('set-cookie'));
  for (const cookieLine of headerList) {
    const [cookiePair] = cookieLine.split(';');
    const eqIndex = cookiePair.indexOf('=');
    if (eqIndex > 0) {
      session.cookies.set(cookiePair.slice(0, eqIndex).trim(), cookiePair.slice(eqIndex + 1).trim());
    }
  }
}

function cookieHeader(session) {
  return Array.from(session.cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function newSession() {
  return { cookies: new Map(), csrfToken: '', updatedAt: Date.now() };
}

async function nclatFetch(session, path, options = {}) {
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

  const response = await fetch(`${NCLAT_BASE}${path}`, {
    ...options,
    headers,
    redirect: 'manual',
  });
  applyCookies(session, response);
  session.updatedAt = Date.now();
  return response;
}

async function ensureFreshSession() {
  if (cachedSession && Date.now() - cachedSession.updatedAt < SESSION_TTL_MS) {
    return cachedSession;
  }

  const session = newSession();
  const response = await nclatFetch(session, NCLAT_FORM_PATH, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok && response.status !== 200) {
    throw new Error(`NCLAT form page returned ${response.status}`);
  }

  const html = await response.text();
  const tokenMatch = html.match(/name="_token"\s+value="([^"]+)"/i);
  if (!tokenMatch) {
    throw new Error('Could not extract NCLAT CSRF token from form page.');
  }
  session.csrfToken = tokenMatch[1];
  cachedSession = session;
  return session;
}

function buildFormBody(fields) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(fields || {})) {
    params.append(name, value == null ? '' : String(value));
  }
  return params.toString();
}

async function postForm(session, path, fields) {
  const response = await nclatFetch(session, path, {
    body: buildFormBody(fields),
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: NCLAT_BASE,
      Referer: `${NCLAT_BASE}${NCLAT_FORM_PATH}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    method: 'POST',
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `NCLAT ${path} returned ${response.status}: ${raw.slice(0, 200).replace(/\s+/g, ' ')}`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `NCLAT ${path} returned non-JSON: ${raw.slice(0, 200).replace(/\s+/g, ' ')}`,
    );
  }
}

async function searchByCaseNumber(session, { location, caseType, caseNumber, caseYear }) {
  const fields = {
    _token: session.csrfToken,
    advocate_name: '',
    case_number: caseNumber,
    case_status: 'all',
    case_type: caseType,
    case_year: caseYear,
    diary_no: '',
    exact_search_word: '',
    from_date: '',
    location,
    party_name: '',
    search_by: 'case_no_wise',
    select_party: '1',
    text_name: '',
    to_date: '',
  };
  const result = await postForm(session, NCLAT_SEARCH_PATH, fields);

  if (!result || !Array.isArray(result.data) || result.data.length === 0) {
    return null;
  }
  // DataTables-style response: array of arrays.
  // [serial, filing_no, case_title_html, parties_html, filing_date, status_html, action_html]
  const row = result.data[0];
  return {
    caseTitle: stripHtml(String(row[2] || '')),
    filingDate: row[4] || '',
    filingNo: String(row[1] || ''),
    parties: stripHtml(String(row[3] || '')),
    statusHtml: row[5] || '',
  };
}

async function fetchDetailsByFilingNo(session, { filingNo, location }) {
  const fields = {
    _token: session.csrfToken,
    bench_name: location,
    filing_no: filingNo,
    search_type: 'view_details',
  };
  return postForm(session, NCLAT_DETAIL_PATH, fields);
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateDdMmYyyy(isoOrAny) {
  if (!isoOrAny) {
    return '';
  }
  const value = String(isoOrAny).trim();
  // Already dd/mm/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    return value;
  }
  // ISO date YYYY-MM-DD
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return value;
}

function namesFrom(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map((entry) => (entry && entry.name) || '').filter(Boolean);
}

function caseTypeLabelFor(id) {
  const match = NCLAT_CASE_TYPES.find((entry) => entry.id === String(id));
  return match ? match.name : '';
}

function statusFromCode(code) {
  if (!code) return '';
  const c = String(code).toUpperCase();
  if (c === 'D') return 'Disposed';
  if (c === 'P') return 'Pending';
  return code;
}

function mapDetailToStatus(searchResult, detailPayload) {
  const data = (detailPayload && detailPayload.data) || {};
  const caseDetail = Array.isArray(data.case_details) ? data.case_details[0] || {} : {};
  const nextHearing = data.next_hearing_details || {};
  const lastHearing = data.last_hearing_details || {};
  const firstHearing = data.first_hearing_details || {};
  const party = data.party_details || {};
  const legal = data.legal_representative || {};

  const caseTypeLabel = caseDetail.case_type || '';
  const caseRef = caseTypeLabel
    ? `${caseTypeLabel} ${caseDetail.case_no || ''}/${caseDetail.case_year || ''}`.trim()
    : searchResult.caseTitle;

  const judgePieces = [];
  if (nextHearing.coram) {
    judgePieces.push(stripHtml(nextHearing.coram));
  } else if (lastHearing.coram) {
    judgePieces.push(stripHtml(lastHearing.coram));
  }
  if (nextHearing.court_no || lastHearing.court_no || firstHearing.court_no) {
    judgePieces.push(`Court ${nextHearing.court_no || lastHearing.court_no || firstHearing.court_no}`);
  }

  return {
    caseNumber: caseRef,
    classification: '',
    cnrNumber: '',
    dateOfDecision: '',
    diaryNumber: searchResult.filingNo,
    filingDate: formatDateDdMmYyyy(caseDetail.date_of_filing),
    filingNumber: searchResult.filingNo,
    judge: judgePieces.filter(Boolean).join(' — '),
    lastActionTaken: lastHearing.stage_of_case || '',
    lastPostedFor: nextHearing.stage_of_case || lastHearing.stage_of_case || '',
    nextHearingDate: formatDateDdMmYyyy(nextHearing.hearing_date || lastHearing.hearing_date),
    petitioner: namesFrom(party.applicant_name).join('; '),
    petitionerAdvocate: (legal.applicant_legal_representative_name || []).join(', '),
    rawText: JSON.stringify(detailPayload),
    registrationDate: formatDateDdMmYyyy(caseDetail.registration_date),
    respondent: namesFrom(party.respondant_name).join('; '),
    respondentAdvocate: (legal.respondent_legal_representative_name || []).join(', '),
    status: statusFromCode(caseDetail.status) || searchResult.statusHtml || '',
  };
}

async function fetchNclatCase(savedCase) {
  const location = String(savedCase.benchId || '').trim().toLowerCase();
  const caseType = String(savedCase.caseType || '').trim();
  const caseNumber = String(savedCase.caseNumber || '').trim();
  const caseYear = String(savedCase.caseYear || '').trim();

  if (!location || !caseType || !caseNumber || !caseYear) {
    return {
      error: 'NCLAT case requires bench (delhi/chennai), case type, case number and year.',
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  if (!NCLAT_LOCATIONS.some((entry) => entry.id === location)) {
    return {
      error: `Unknown NCLAT bench "${location}". Use "delhi" or "chennai".`,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  try {
    const session = await ensureFreshSession();

    const searchResult = await searchByCaseNumber(session, {
      caseNumber,
      caseType,
      caseYear,
      location,
    });

    if (!searchResult || !searchResult.filingNo) {
      return {
        error: 'No NCLAT case found with the given bench / type / number / year.',
        fetchedAt: new Date().toISOString(),
        ok: false,
      };
    }

    const detail = await fetchDetailsByFilingNo(session, {
      filingNo: searchResult.filingNo,
      location,
    });

    if (!detail || detail.status !== 200) {
      // status 401/500 etc — try once more with a fresh token
      cachedSession = null;
      const retrySession = await ensureFreshSession();
      const retryDetail = await fetchDetailsByFilingNo(retrySession, {
        filingNo: searchResult.filingNo,
        location,
      });
      if (!retryDetail || retryDetail.status !== 200) {
        return {
          error: 'NCLAT view_details returned non-success status.',
          fetchedAt: new Date().toISOString(),
          ok: false,
        };
      }
      return {
        caseStatus: mapDetailToStatus(searchResult, retryDetail),
        fetchedAt: new Date().toISOString(),
        ok: true,
        source: `${NCLAT_BASE}${NCLAT_FORM_PATH}`,
      };
    }

    return {
      caseStatus: mapDetailToStatus(searchResult, detail),
      fetchedAt: new Date().toISOString(),
      ok: true,
      source: `${NCLAT_BASE}${NCLAT_FORM_PATH}`,
    };
  } catch (fetchError) {
    // Invalidate session on hard failure so the next attempt rebuilds it.
    cachedSession = null;
    return {
      error: fetchError.message,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }
}

function listNclatBenches() {
  return NCLAT_LOCATIONS;
}

function listNclatCaseTypes() {
  return NCLAT_CASE_TYPES;
}

module.exports = {
  fetchNclatCase,
  listNclatBenches,
  listNclatCaseTypes,
};
