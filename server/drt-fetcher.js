const crypto = require('node:crypto');

const DRT_BASE = 'https://drt.gov.in';
const DRT_API_BASE = '/drtapi';
const PASSPHRASE = 'ostrich';

// CryptoJS-compatible OpenSSL "Salted__" passphrase decryption.
// DRT's React SPA encrypts API responses; we mirror their CryptoJS.AES decrypt.
function decryptCryptoJS(b64) {
  const data = Buffer.from(b64, 'base64');
  if (data.subarray(0, 8).toString() !== 'Salted__') {
    throw new Error('DRT response is not in the expected CryptoJS-salted format.');
  }
  const salt = data.subarray(8, 16);
  const body = data.subarray(16);

  // EVP_BytesToKey: MD5(prev || passphrase || salt) until we have key+iv (48 bytes)
  let derived = Buffer.alloc(0);
  let last = Buffer.alloc(0);
  while (derived.length < 48) {
    const md5 = crypto.createHash('md5');
    md5.update(last);
    md5.update(Buffer.from(PASSPHRASE));
    md5.update(salt);
    last = md5.digest();
    derived = Buffer.concat([derived, last]);
  }
  const key = derived.subarray(0, 32);
  const iv = derived.subarray(32, 48);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

function buildMultipartBody(fields) {
  const boundary = `----formboundary${Math.random().toString(36).slice(2)}${Date.now()}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null) {
      continue;
    }
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  return { body: parts.join(''), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function postDrtApi(path, fields = {}) {
  const { body, contentType } = buildMultipartBody(fields);

  // NOTE: do NOT send Origin header — DRT's CORS middleware has a malformed
  // regex that 500s when Origin is present. Their server-to-server calls work
  // fine without it.
  const response = await fetch(`${DRT_BASE}${DRT_API_BASE}${path}`, {
    body,
    headers: {
      Accept: 'application/json',
      'Content-Type': contentType,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
    method: 'POST',
  });

  const raw = await response.text();

  if (!response.ok) {
    // Validation errors come through as plaintext JSON
    let summary = raw;
    try {
      const parsed = JSON.parse(raw);
      summary = parsed && typeof parsed === 'object' ? JSON.stringify(parsed) : raw;
    } catch {
      /* keep raw */
    }
    throw new Error(`DRT API ${path} returned ${response.status}: ${summary.slice(0, 200)}`);
  }

  if (raw.startsWith('U2FsdGVkX1')) {
    const decrypted = decryptCryptoJS(raw);
    return JSON.parse(decrypted);
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function listDrtBenches() {
  return postDrtApi('/getDrtDratScheamName');
}

async function listDrtCaseTypes(schemeNameDrtId) {
  if (!schemeNameDrtId) {
    throw new Error('schemeNameDrtId is required to list DRT case types.');
  }
  return postDrtApi('/getDrtDratCaseTyepName', { schemeNameDrtId });
}

function emptyResultMeansNoCase(payload) {
  if (!payload || typeof payload !== 'object') {
    return true;
  }
  // DRT returns an empty object {} when no case matches.
  const hasAnyField = ['caseno', 'casetype', 'petitionerName', 'casestatus'].some(
    (key) => payload[key] && String(payload[key]).trim() !== '',
  );
  return !hasAnyField;
}

function mapDrtCaseToStatus(payload) {
  const caseRef = [payload.casetype, payload.caseno && `${payload.caseno}/${payload.caseyear || ''}`]
    .filter(Boolean)
    .join(' ');
  const judgeText = payload.courtName
    ? `${payload.courtName}${payload.courtNo ? ` (Court ${payload.courtNo})` : ''}`
    : '';

  return {
    caseNumber: caseRef,
    classification: '',
    cnrNumber: '',
    dateOfDecision: payload.dateofdisposal || '',
    diaryNumber: payload.diaryno ? `${payload.diaryno}/${payload.diaryyear || ''}` : '',
    filingDate: payload.dateoffiling || '',
    filingNumber: '',
    judge: judgeText,
    lastActionTaken: payload.disposalNature || '',
    lastPostedFor: payload.nextListingPurpose || '',
    nextHearingDate: payload.nextlistingdate || '',
    petitioner: payload.petitionerName || '',
    petitionerAdvocate: payload.advocatePetName || '',
    rawText: JSON.stringify(payload),
    respondent: payload.respondentName || '',
    respondentAdvocate: payload.advocateResName || '',
    status: payload.casestatus || '',
    suitAmount: payload.suit_amount || '',
  };
}

async function fetchDrtCase(savedCase) {
  const schemeNameDrtId = String(savedCase.benchId || '').trim();
  const casetypeId = String(savedCase.caseType || '').trim();
  const caseNo = String(savedCase.caseNumber || '').trim();
  const caseYear = String(savedCase.caseYear || '').trim();

  if (!schemeNameDrtId || !casetypeId || !caseNo || !caseYear) {
    return {
      error:
        'DRT case requires bench ID (schemeNameDrtId), case-type ID, case number and year.',
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  try {
    const payload = await postDrtApi('/getCaseDetailCaseNoWise', {
      caseNo,
      caseYear,
      casetypeId,
      schemeNameDrtId,
    });

    if (emptyResultMeansNoCase(payload)) {
      return {
        error: 'DRT returned no case for the given bench / type / number / year.',
        fetchedAt: new Date().toISOString(),
        ok: false,
      };
    }

    return {
      caseStatus: mapDrtCaseToStatus(payload),
      fetchedAt: new Date().toISOString(),
      ok: true,
      source: `${DRT_BASE}/casedetail`,
    };
  } catch (fetchError) {
    return {
      error: fetchError.message,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }
}

module.exports = {
  fetchDrtCase,
  listDrtBenches,
  listDrtCaseTypes,
};
