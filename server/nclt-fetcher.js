const NCLT_BASE = 'https://nclt.gov.in';
const NCLT_SEARCH_PATH = '/order-cp-wise-search';
const NCLT_DETAIL_PATH = '/case-details';

const NCLT_BENCHES = [
  { id: 'ahmedabad', name: 'Ahmedabad Bench' },
  { id: 'allahabad', name: 'Allahabad Bench' },
  { id: 'amravati', name: 'Amaravati Bench' },
  { id: 'bengaluru', name: 'Bengaluru Bench' },
  { id: 'chandigarh', name: 'Chandigarh Bench' },
  { id: 'chennai', name: 'Chennai Bench' },
  { id: 'cuttack', name: 'Cuttack Bench' },
  { id: 'guwahati', name: 'Guwahati Bench' },
  { id: 'hyderabad', name: 'Hyderabad Bench' },
  { id: 'indore', name: 'Indore Bench' },
  { id: 'jaipur', name: 'Jaipur Bench' },
  { id: 'kochi', name: 'Kochi Bench' },
  { id: 'kolkata', name: 'Kolkata Bench' },
  { id: 'mumbai', name: 'Mumbai Bench' },
  { id: 'delhi', name: 'New Delhi (Principal Bench)' },
];

const NCLT_CASE_TYPES = [
  { id: '1', name: 'Transfer Petition(Companies Act)' },
  { id: '2', name: 'Company Petition (Companies Act)' },
  { id: '3', name: 'Rehabilitation petition (Companies Act)' },
  { id: '4', name: 'Interlocatory Application(Companies Act)' },
  { id: '5', name: 'Review Application (Companies Act)' },
  { id: '6', name: 'Restoration Application (Companies Act)' },
  { id: '7', name: 'Intervention Petition(Companies Act)' },
  { id: '8', name: 'Cross Application (Companies Act)' },
  { id: '9', name: 'Contempt Petition(Companies Act)' },
  { id: '10', name: 'Miscellaneous Application(Companies Act)' },
  { id: '11', name: 'Company Appeal(Companies Act)' },
  { id: '12', name: 'Cross Appeal(Companies Act)' },
  { id: '13', name: 'Company Application(Companies Act)' },
  { id: '14', name: 'CA(A) Merger and Amalgamation(Companies Act)' },
  { id: '15', name: 'CP(AA) Merger and Amalgamation(Companies Act)' },
  { id: '16', name: 'Company Petition IB (IBC)' },
  { id: '18', name: 'Company Application(IBC)' },
  { id: '19', name: 'Rehabilitation petition(IBC)' },
  { id: '20', name: 'Interlocatory Application (IBC)' },
  { id: '21', name: 'Review Application (IBC)' },
  { id: '22', name: 'Restoration Application (IBC)' },
  { id: '23', name: 'Intervention Petition (IBC)' },
  { id: '24', name: 'Cross Application (IBC)' },
  { id: '25', name: 'Contempt Petition (IBC)' },
  { id: '26', name: 'Miscellaneous Application (IBC)' },
  { id: '27', name: 'Company Appeal (IBC)' },
  { id: '28', name: 'Cross Appeal (IBC)' },
  { id: '29', name: 'Transfer Petition (IBC)' },
  { id: '30', name: 'Execution Petition' },
  { id: '31', name: 'Interlocutory Application (I.B.C)' },
  { id: '32', name: 'Transfer Application' },
  { id: '33', name: 'Insolvency & Bankruptcy (Pre-Packaged)' },
  { id: '34', name: 'Transfer Application (IBC)' },
  { id: '35', name: 'Voluntary Liquidation (IBC)' },
  { id: '36', name: 'Restored Company Petition (IBC)' },
  { id: '37', name: 'Restored Company Petition (Companies Act)' },
  { id: '38', name: 'Interlocutory Application(IBC)(Plan)' },
  { id: '39', name: 'Interlocutory Application(IBC)(Liq.)' },
  { id: '40', name: 'Interlocutory Application(IBC)(Dis.)' },
  { id: '41', name: 'IA (Liq.) Progress Report' },
  { id: '42', name: 'Rule 63 Appeal' },
];

function base64(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

async function nclatFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      ...(options.headers || {}),
    },
    redirect: 'follow',
  });
  if (!response.ok && response.status !== 200) {
    throw new Error(`NCLT ${url} returned ${response.status}`);
  }
  return response.text();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTagsAndWhitespace(value) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim();
}

// Extract the first table row from the search result. Columns are:
// [S.No, Filing No., Case No., Petitioner Vs. Respondent, Listing Date / Court No., Status]
function parseSearchResult(html) {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) {
    return null;
  }
  const tbody = tbodyMatch[1];
  const firstRowMatch = tbody.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
  if (!firstRowMatch) {
    return null;
  }
  const cells = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = cellRegex.exec(firstRowMatch[1]))) {
    cells.push(m[1]);
  }
  if (cells.length < 6) {
    return null;
  }
  const statusLink = cells[5].match(/href="([^"]+)"/);
  const detailHref = statusLink ? statusLink[1] : '';
  return {
    caseNo: stripTagsAndWhitespace(cells[2]),
    detailHref,
    filingNo: stripTagsAndWhitespace(cells[1]),
    listingDate: stripTagsAndWhitespace(cells[4]),
    parties: stripTagsAndWhitespace(cells[3]),
    statusText: stripTagsAndWhitespace(cells[5]),
  };
}

// Extract a value from "<td>LABEL</td><td><span ...>VALUE</span></td>"
function extractLabeledField(html, label) {
  const labelEscaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<td[^>]*>\\s*${labelEscaped}\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`,
    'i',
  );
  const match = html.match(pattern);
  return match ? stripTagsAndWhitespace(match[1]) : '';
}

function namesFromCellHtml(cellHtml) {
  if (!cellHtml) {
    return [];
  }
  const cleaned = cellHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(cleaned)
    .split(/\n+/)
    .map((s) => s.replace(/,\s*$/, '').trim())
    .filter(Boolean);
}

// Find the table whose <thead> contains BOTH "Petitioner" and "Respondent"
// headers (they sit side-by-side as two columns) and return the names from
// each column separately.
function extractPartyColumns(html) {
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];
  for (const table of tables) {
    if (!/<th[^>]*>\s*Petitioner\b/i.test(table)) continue;
    if (!/<th[^>]*>\s*Respondent\b/i.test(table)) continue;

    const headers = (table.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || []).map(
      (h) => stripTagsAndWhitespace(h),
    );
    const petIdx = headers.findIndex((h) => /^Petitioner\b/i.test(h));
    const resIdx = headers.findIndex((h) => /^Respondent\b/i.test(h));
    if (petIdx < 0) continue;

    const tbodyMatch = table.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) continue;

    const rows = tbodyMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const petitioners = [];
    const respondents = [];
    for (const row of rows) {
      const cellMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
      if (cellMatches.length > petIdx) {
        petitioners.push(...namesFromCellHtml(cellMatches[petIdx][1]));
      }
      if (resIdx >= 0 && cellMatches.length > resIdx) {
        respondents.push(...namesFromCellHtml(cellMatches[resIdx][1]));
      }
    }
    return { petitioners, respondents };
  }
  return { petitioners: [], respondents: [] };
}

function parseDetailPage(html, searchResult) {
  const filingNumber = extractLabeledField(html, 'Filing Number');
  const filingDate = extractLabeledField(html, 'Filing Date');
  const partyName = extractLabeledField(html, 'Party Name');
  const petitionerAdvocate = extractLabeledField(html, 'Petitioner Advocate\\(s\\)');
  const respondentAdvocate = extractLabeledField(html, 'Respondent Advocate\\(s\\)');
  const caseNumber = extractLabeledField(html, 'Case Number');
  const registeredOn = extractLabeledField(html, 'Registered On');
  const lastListed = extractLabeledField(html, 'Last Listed');
  const caseStatus = extractLabeledField(html, 'Case Status');

  const { petitioners, respondents } = extractPartyColumns(html);

  // Latest "Date of Listing" from Listing History table
  let latestListingDate = '';
  const listingHistoryMatch = html.match(
    /Listing History[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i,
  );
  if (listingHistoryMatch) {
    const firstRow = listingHistoryMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    if (firstRow) {
      const cells = firstRow[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length >= 2) {
        latestListingDate = stripTagsAndWhitespace(cells[1]);
      }
    }
  }

  return {
    caseNumber: caseNumber || searchResult.caseNo,
    classification: '',
    cnrNumber: '',
    dateOfDecision: '',
    diaryNumber: filingNumber || searchResult.filingNo,
    filingDate,
    filingNumber: filingNumber || searchResult.filingNo,
    judge: '',
    lastActionTaken: '',
    lastPostedFor: '',
    nextHearingDate: lastListed || latestListingDate || searchResult.listingDate,
    petitioner: petitioners.length ? petitioners.join('; ') : partyName,
    petitionerAdvocate,
    rawText: '',
    registrationDate: registeredOn,
    respondent: respondents.join('; '),
    respondentAdvocate,
    status: caseStatus || searchResult.statusText,
  };
}

async function fetchNcltCase(savedCase) {
  const bench = String(savedCase.benchId || '').trim().toLowerCase();
  const caseType = String(savedCase.caseType || '').trim();
  const cpNo = String(savedCase.caseNumber || '').trim();
  const year = String(savedCase.caseYear || '').trim();

  if (!bench || !caseType || !cpNo || !year) {
    return {
      error: 'NCLT case requires bench, case type, case number and year.',
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  if (!NCLT_BENCHES.some((entry) => entry.id === bench)) {
    return {
      error: `Unknown NCLT bench "${bench}".`,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  const searchUrl =
    `${NCLT_BASE}${NCLT_SEARCH_PATH}` +
    `?bench=${encodeURIComponent(base64(bench))}` +
    `&case_type=${encodeURIComponent(base64(caseType))}` +
    `&cp_no=${encodeURIComponent(base64(cpNo))}` +
    `&year=${encodeURIComponent(base64(year))}`;

  try {
    const searchHtml = await nclatFetch(searchUrl);
    const searchResult = parseSearchResult(searchHtml);

    if (!searchResult || !searchResult.filingNo) {
      return {
        error: 'No NCLT case found with the given bench / type / number / year.',
        fetchedAt: new Date().toISOString(),
        ok: false,
      };
    }

    // Detail page: if the status cell linked to case-details, follow it.
    let detailHtml = '';
    if (searchResult.detailHref) {
      const detailUrl = searchResult.detailHref.startsWith('http')
        ? searchResult.detailHref
        : `${NCLT_BASE}/${searchResult.detailHref.replace(/^\/+/, '')}`;
      try {
        detailHtml = await nclatFetch(detailUrl);
      } catch (detailError) {
        // If detail fails, fall back to search result only
        detailHtml = '';
      }
    }

    const caseStatus = detailHtml
      ? parseDetailPage(detailHtml, searchResult)
      : {
          caseNumber: searchResult.caseNo,
          classification: '',
          cnrNumber: '',
          dateOfDecision: '',
          diaryNumber: searchResult.filingNo,
          filingDate: '',
          filingNumber: searchResult.filingNo,
          judge: '',
          lastActionTaken: '',
          lastPostedFor: '',
          nextHearingDate: searchResult.listingDate,
          petitioner: searchResult.parties,
          petitionerAdvocate: '',
          rawText: '',
          registrationDate: '',
          respondent: '',
          respondentAdvocate: '',
          status: searchResult.statusText,
        };

    return {
      caseStatus,
      fetchedAt: new Date().toISOString(),
      ok: true,
      source: `${NCLT_BASE}/order-cp-wise`,
    };
  } catch (fetchError) {
    return {
      error: fetchError.message,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }
}

function listNcltBenches() {
  return NCLT_BENCHES;
}

function listNcltCaseTypes() {
  return NCLT_CASE_TYPES;
}

module.exports = {
  fetchNcltCase,
  listNcltBenches,
  listNcltCaseTypes,
};
