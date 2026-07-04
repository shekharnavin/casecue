const { fetchDrtCase } = require('./drt-fetcher');
const { fetchECourtsCase } = require('./ecourts-fetcher');
const { fetchKarnatakaHCCase } = require('./karnataka-hc-fetcher');
const { fetchNclatCase } = require('./nclat-fetcher');
const { fetchNcltCase } = require('./nclt-fetcher');

const adapters = [
  {
    fetch: fetchKarnatakaHCCase,
    fields: [
      { id: 'benchId', label: 'Bench', required: true, type: 'enum' },
      { id: 'caseType', label: 'Case Type', required: true, type: 'enum' },
      { id: 'caseNumber', label: 'Case Number', required: true, type: 'text' },
      { id: 'caseYear', label: 'Case Year', required: true, type: 'text' },
    ],
    id: 'karnatakaHC',
    name: 'High Court of Karnataka',
    portalUrl: 'https://judiciary.karnataka.gov.in/casemenu.php',
    urlPatterns: [/(?:^|\.)judiciary\.karnataka\.gov\.in$/i],
  },
  {
    fetch: fetchECourtsCase,
    fields: [
      {
        id: 'caseNumber',
        label: 'CNR Number (16 chars)',
        placeholder: 'e.g. KAHC010012342024',
        required: true,
        type: 'text',
      },
    ],
    id: 'ecourts',
    name: 'eCourts — District Courts (by CNR)',
    portalUrl: 'https://services.ecourts.gov.in/ecourtindia_v6/?p=home/index',
    urlPatterns: [/(?:^|\.)ecourts\.gov\.in$/i],
  },
  {
    fetch: fetchDrtCase,
    fields: [
      { id: 'benchId', label: 'DRT bench', required: true, type: 'enum' },
      { id: 'caseType', label: 'Case type', required: true, type: 'enum' },
      { id: 'caseNumber', label: 'Case number', required: true, type: 'text' },
      { id: 'caseYear', label: 'Case year', required: true, type: 'text' },
    ],
    id: 'drt',
    name: 'DRT / DRAT (Debts Recovery Tribunals)',
    portalUrl: 'https://drt.gov.in/casedetail',
    urlPatterns: [/(?:^|\.)drt\.gov\.in$/i],
  },
  {
    fetch: fetchNclatCase,
    fields: [
      { id: 'benchId', label: 'NCLAT bench', required: true, type: 'enum' },
      { id: 'caseType', label: 'Case type', required: true, type: 'enum' },
      { id: 'caseNumber', label: 'Case number', required: true, type: 'text' },
      { id: 'caseYear', label: 'Case year', required: true, type: 'text' },
    ],
    id: 'nclat',
    name: 'NCLAT (Company Law Appellate Tribunal)',
    portalUrl: 'https://nclat.nic.in/display-board/cases',
    urlPatterns: [/(?:^|\.)nclat\.(nic|gov)\.in$/i],
  },
  {
    fetch: fetchNcltCase,
    fields: [
      { id: 'benchId', label: 'NCLT bench', required: true, type: 'enum' },
      { id: 'caseType', label: 'Case type', required: true, type: 'enum' },
      { id: 'caseNumber', label: 'Case number', required: true, type: 'text' },
      { id: 'caseYear', label: 'Case year', required: true, type: 'text' },
    ],
    id: 'nclt',
    name: 'NCLT (National Company Law Tribunal — 15 benches)',
    portalUrl: 'https://nclt.gov.in/order-cp-wise',
    urlPatterns: [/(?:^|\.)nclt\.(gov|nic)\.in$/i],
  },
];

function parseUrl(value) {
  if (!value) {
    return null;
  }
  try {
    return new URL(String(value).trim());
  } catch {
    return null;
  }
}

function matchAdapterByUrl(sourceUrl) {
  const parsed = parseUrl(sourceUrl);
  if (!parsed) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  for (const adapter of adapters) {
    if (adapter.urlPatterns.some((pattern) => pattern.test(hostname))) {
      return adapter;
    }
  }
  return null;
}

function getAdapterById(id) {
  if (!id) {
    return null;
  }
  return adapters.find((adapter) => adapter.id === id) || null;
}

function getAdapterForCase(savedCase) {
  if (savedCase.portalId) {
    const byId = getAdapterById(savedCase.portalId);
    if (byId) {
      return byId;
    }
  }
  return matchAdapterByUrl(savedCase.sourceUrl);
}

function listAdapters() {
  return adapters.map((adapter) => ({
    fields: adapter.fields,
    id: adapter.id,
    name: adapter.name,
    portalUrl: adapter.portalUrl,
  }));
}

function inferPortalIdForLegacyCase(savedCase) {
  if (savedCase.courtType === 'highCourtKarnataka') {
    return {
      portalId: 'karnatakaHC',
      sourceUrl: 'https://judiciary.karnataka.gov.in/casemenu.php',
    };
  }
  return null;
}

module.exports = {
  getAdapterById,
  getAdapterForCase,
  inferPortalIdForLegacyCase,
  listAdapters,
  matchAdapterByUrl,
};
