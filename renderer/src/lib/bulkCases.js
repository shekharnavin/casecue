import * as XLSX from 'xlsx';

import { DEFAULT_SCHEDULE_CRON, getAllSchedules } from './schedules.js';

// Reference lists mirror the server adapters so the template can offer friendly
// names (mapped to the codes each portal expects) without a network round-trip.
// DRT bench / case-type IDs are dynamic (fetched live from drt.gov.in), so DRT
// rows must use the numeric IDs shown in the in-app "Add case" dialog.
const KARNATAKA_BENCHES = [
  { id: 'B', name: 'Bengaluru Bench' },
  { id: 'D', name: 'Dharwad Bench' },
  { id: 'K', name: 'Kalaburagi Bench' },
];

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
  { id: '2', name: 'Company Petition (Companies Act)' },
  { id: '16', name: 'Company Petition IB (IBC)' },
  { id: '18', name: 'Company Application(IBC)' },
  { id: '13', name: 'Company Application(Companies Act)' },
  { id: '11', name: 'Company Appeal(Companies Act)' },
  { id: '27', name: 'Company Appeal (IBC)' },
  { id: '10', name: 'Miscellaneous Application(Companies Act)' },
  { id: '26', name: 'Miscellaneous Application (IBC)' },
  { id: '4', name: 'Interlocatory Application(Companies Act)' },
  { id: '20', name: 'Interlocatory Application (IBC)' },
];

const NCLAT_BENCHES = [
  { id: 'delhi', name: 'New Delhi (Principal Bench)' },
  { id: 'chennai', name: 'Chennai Bench' },
];

const NCLAT_CASE_TYPES = [
  { id: '32', name: 'Company Appeal(AT)' },
  { id: '33', name: 'Company Appeal(AT)(Ins)' },
  { id: '34', name: 'Competition Appeal(AT)' },
  { id: '35', name: 'Interlocutory Application' },
  { id: '37', name: 'Contempt Case(AT)' },
  { id: '38', name: 'Review Application' },
];

// Friendly court text -> internal courtType + adapter id used for the portal URL.
const COURT_MAP = [
  { adapterId: 'karnatakaHC', aliases: ['karnataka high court', 'karnataka hc', 'highcourtkarnataka', 'karnataka'], courtType: 'highCourtKarnataka' },
  { adapterId: 'ecourts', aliases: ['ecourts', 'e-courts', 'e courts', 'district court', 'district courts'], courtType: 'ecourts' },
  { adapterId: 'drt', aliases: ['drt', 'drat', 'debt recovery tribunal', 'debts recovery tribunal'], courtType: 'drt' },
  { adapterId: 'nclt', aliases: ['nclt', 'national company law tribunal'], courtType: 'nclt' },
  { adapterId: 'nclat', aliases: ['nclat', 'national company law appellate tribunal'], courtType: 'nclat' },
];

const CASE_HEADERS = [
  'Court',
  'Bench',
  'Case Type',
  'Case Number',
  'Case Year',
  'CNR (eCourts only)',
  'Recipients (emails)',
  'Schedule',
];

function norm(value) {
  return String(value || '').trim();
}

function lower(value) {
  return norm(value).toLowerCase();
}

function matchByNameOrId(list, value) {
  const key = lower(value);
  if (!key) {
    return '';
  }
  const byId = list.find((item) => lower(item.id) === key);
  if (byId) {
    return byId.id;
  }
  const byName = list.find((item) => lower(item.name) === key);
  if (byName) {
    return byName.id;
  }
  // Loose contains match ("mumbai" -> "Mumbai Bench").
  const byPartial = list.find((item) => lower(item.name).includes(key));
  return byPartial ? byPartial.id : '';
}

// Build and download the Excel template (data sheet + a reference sheet).
export function downloadCaseTemplate() {
  const example = [
    {
      Court: 'Karnataka High Court',
      Bench: 'Bengaluru Bench',
      'Case Type': 'WP',
      'Case Number': '17880',
      'Case Year': '2024',
      'CNR (eCourts only)': '',
      'Recipients (emails)': 'ramesh@example.com, priya@example.com',
      Schedule: 'Twice daily — 8 AM + 6 PM',
    },
    {
      Court: 'eCourts',
      Bench: '',
      'Case Type': '',
      'Case Number': '',
      'Case Year': '',
      'CNR (eCourts only)': 'KAHC010012342024',
      'Recipients (emails)': 'ramesh@example.com',
      Schedule: '',
    },
    {
      Court: 'NCLT',
      Bench: 'Mumbai Bench',
      'Case Type': 'Company Petition IB (IBC)',
      'Case Number': '1',
      'Case Year': '2024',
      'CNR (eCourts only)': '',
      'Recipients (emails)': '',
      Schedule: '',
    },
  ];
  const casesSheet = XLSX.utils.json_to_sheet(example, { header: CASE_HEADERS });
  casesSheet['!cols'] = [
    { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 32 }, { wch: 26 },
  ];

  const ref = [
    ['CaseCue — Bulk Case Upload'],
    [],
    ['Fill the "Cases" sheet, one row per case, then upload it.'],
    ['Required: Court, Case Number, Case Year. For eCourts fill only the CNR column (16 characters).'],
    ['Recipients: comma-separated emails that already exist in the Recipients list (unknown ones are ignored).'],
    ['Schedule: leave blank for the default (Twice daily). Or use one of the schedule labels below.'],
    [],
    ['Valid "Court" values:'],
    ['Karnataka High Court', 'eCourts', 'DRT', 'NCLT', 'NCLAT'],
    ['(Any other text is saved as a manual-tracking court with no auto-fetch.)'],
    [],
    ['Karnataka High Court — Bench (name or letter):'],
    ...KARNATAKA_BENCHES.map((b) => [b.name, b.id]),
    ['Case Type: free text, e.g. WP, WA, CRP, MFA, CRL.P'],
    [],
    ['NCLT — Bench values:'],
    ...NCLT_BENCHES.map((b) => [b.name]),
    ['NCLT — common Case Type values:'],
    ...NCLT_CASE_TYPES.map((t) => [t.name]),
    [],
    ['NCLAT — Bench values:'],
    ...NCLAT_BENCHES.map((b) => [b.name]),
    ['NCLAT — common Case Type values:'],
    ...NCLAT_CASE_TYPES.map((t) => [t.name]),
    [],
    ['DRT — use the numeric Bench ID and Case Type ID shown in the in-app "Add case" dialog'],
    ['(these are fetched live from drt.gov.in and cannot be listed here).'],
    [],
    ['Schedule labels:'],
    ['Daily 8:00 AM'], ['Daily 6:00 PM'], ['Twice daily — 8 AM + 6 PM'], ['Every 6 hours'],
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(ref);
  refSheet['!cols'] = [{ wch: 40 }, { wch: 12 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, casesSheet, 'Cases');
  XLSX.utils.book_append_sheet(workbook, refSheet, 'Instructions');
  XLSX.writeFile(workbook, 'CaseCue-cases-template.xlsx');
}

function pickCell(row, aliases) {
  for (const key of Object.keys(row)) {
    if (aliases.includes(lower(key))) {
      return norm(row[key]);
    }
  }
  return '';
}

// Read an uploaded .xlsx / .csv and return normalized rows from the Cases sheet.
export async function parseCaseRows(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName =
    workbook.SheetNames.find((name) => lower(name) === 'cases') || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rawRows.map((row) => ({
    bench: pickCell(row, ['bench', 'bench / tribunal', 'tribunal']),
    caseNumber: pickCell(row, ['case number', 'case no', 'caseno', 'number']),
    caseType: pickCell(row, ['case type', 'casetype', 'type']),
    caseYear: pickCell(row, ['case year', 'caseyear', 'year']),
    cnr: pickCell(row, ['cnr (ecourts only)', 'cnr', 'cnr number']),
    court: pickCell(row, ['court', 'court type', 'portal']),
    recipients: pickCell(row, ['recipients (emails)', 'recipients', 'emails', 'recipient']),
    schedule: pickCell(row, ['schedule', 'check schedule']),
  }));
}

function resolveRecipients(text, users) {
  const tokens = String(text || '')
    .split(/[;,]/)
    .map((token) => token.trim())
    .filter(Boolean);
  const ids = [];
  const unmatched = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    const digits = token.replace(/\D/g, '');
    const user = users.find(
      (candidate) =>
        (candidate.email && candidate.email.toLowerCase() === key) ||
        (digits && candidate.phone && candidate.phone.replace(/\D/g, '') === digits),
    );
    if (user) {
      if (!ids.includes(user.id)) {
        ids.push(user.id);
      }
    } else {
      unmatched.push(token);
    }
  }
  return { ids, unmatched };
}

function resolveSchedule(text, scheduleOptions) {
  const value = norm(text);
  if (!value) {
    return DEFAULT_SCHEDULE_CRON;
  }
  const match = scheduleOptions.find(
    (option) => lower(option.label) === lower(value) || option.cron === value,
  );
  return match ? match.cron : DEFAULT_SCHEDULE_CRON;
}

function portalUrlFor(adapterId, portals) {
  const portal = portals.find((item) => item.id === adapterId);
  return portal ? portal.portalUrl : '';
}

// Turn one parsed row into a case object matching what the Add-Case form produces.
// Returns { case } on success or { error } describing why the row was skipped.
export function resolveCaseRow(row, { portals = [], users = [], scheduleOptions = [], userId = '' }) {
  const courtText = norm(row.court);
  if (!courtText) {
    return { error: 'missing Court' };
  }

  const { ids: recipientIds } = resolveRecipients(row.recipients, users);
  const schedule = resolveSchedule(row.schedule, scheduleOptions);
  const known = COURT_MAP.find((entry) => entry.aliases.includes(lower(courtText)));

  const base = { recipientIds, schedule, userId };

  // Unsupported / manual-tracking court.
  if (!known) {
    if (!norm(row.caseNumber) || !norm(row.caseYear)) {
      return { error: 'Case Number and Case Year are required' };
    }
    return {
      case: {
        ...base,
        benchId: norm(row.bench) || 'OTHER',
        caseNumber: norm(row.caseNumber),
        caseType: norm(row.caseType).toUpperCase() || 'CASE',
        caseYear: norm(row.caseYear),
        courtType: courtText,
        sourceUrl: '',
      },
    };
  }

  const sourceUrl = portalUrlFor(known.adapterId, portals);

  if (known.courtType === 'ecourts') {
    const cnr = (norm(row.cnr) || norm(row.caseNumber)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cnr.length !== 16) {
      return { error: 'eCourts needs a 16-character CNR' };
    }
    return {
      case: {
        ...base,
        benchId: cnr.slice(0, 4),
        caseNumber: cnr,
        caseType: 'CNR',
        caseYear: cnr.slice(12, 16),
        cnr,
        courtType: 'ecourts',
        sourceUrl,
      },
    };
  }

  const caseNumber = norm(row.caseNumber);
  const caseYear = norm(row.caseYear);
  if (!caseNumber || !caseYear) {
    return { error: 'Case Number and Case Year are required' };
  }

  let benchId = norm(row.bench);
  let caseType = norm(row.caseType);

  if (known.courtType === 'highCourtKarnataka') {
    benchId = matchByNameOrId(KARNATAKA_BENCHES, benchId) || 'B';
    caseType = caseType.toUpperCase();
    if (!caseType) {
      return { error: 'Case Type is required' };
    }
  } else if (known.courtType === 'nclt') {
    benchId = matchByNameOrId(NCLT_BENCHES, benchId);
    caseType = matchByNameOrId(NCLT_CASE_TYPES, caseType) || caseType;
    if (!benchId) {
      return { error: 'unknown NCLT bench' };
    }
  } else if (known.courtType === 'nclat') {
    benchId = matchByNameOrId(NCLAT_BENCHES, benchId);
    caseType = matchByNameOrId(NCLAT_CASE_TYPES, caseType) || caseType;
    if (!benchId) {
      return { error: 'unknown NCLAT bench' };
    }
  }
  // DRT: benchId and caseType are used as-entered (numeric IDs from the app).

  if (!caseType) {
    return { error: 'Case Type is required' };
  }

  return {
    case: {
      ...base,
      benchId,
      caseNumber,
      caseType,
      caseYear,
      courtType: known.courtType,
      sourceUrl,
    },
  };
}

// A stable key for de-duplicating against existing cases and within the batch.
export function caseDedupeKey(savedCase) {
  return [
    lower(savedCase.courtType),
    lower(savedCase.benchId),
    lower(savedCase.caseType),
    lower(savedCase.caseNumber),
    lower(savedCase.caseYear),
  ].join('|');
}

export { getAllSchedules };
