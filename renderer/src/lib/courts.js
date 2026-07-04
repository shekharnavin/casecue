// Catalog of Indian courts and tribunals.
//
// Selecting any of these in the Add Case modal pre-fills the case as an
// "unsupported portal" (manual tracking, no auto-fetch yet) with the right
// court name and known portal URL. Upgrade to auto-monitor by building an
// adapter for the portal in server/adapters.js.
//
// District / subordinate courts (700+ across India) are intentionally NOT
// enumerated individually — they all share the eCourts national portal and
// are looked up by CNR (16-char Case Number Record). The single "District
// Court (via eCourts)" entry covers all of them.

const SUPREME = [
  { category: 'Apex court', name: 'Supreme Court of India', portalUrl: 'https://main.sci.gov.in/case-status' },
];

const HIGH_COURTS = [
  { category: 'High Court', name: 'Allahabad High Court', portalUrl: 'https://www.allahabadhighcourt.in/' },
  { category: 'High Court', name: 'Andhra Pradesh High Court', portalUrl: 'https://aphc.gov.in/' },
  { category: 'High Court', name: 'Bombay High Court', portalUrl: 'https://bombayhighcourt.nic.in/' },
  { category: 'High Court', name: 'Calcutta High Court', portalUrl: 'https://www.calcuttahighcourt.gov.in/' },
  { category: 'High Court', name: 'Chhattisgarh High Court', portalUrl: 'https://highcourt.cg.gov.in/' },
  { category: 'High Court', name: 'Delhi High Court', portalUrl: 'https://delhihighcourt.nic.in/' },
  { category: 'High Court', name: 'Gauhati High Court', portalUrl: 'https://ghconline.gov.in/' },
  { category: 'High Court', name: 'Gujarat High Court', portalUrl: 'https://gujarathighcourt.nic.in/' },
  { category: 'High Court', name: 'Himachal Pradesh High Court', portalUrl: 'https://hphighcourt.nic.in/' },
  { category: 'High Court', name: 'Jammu & Kashmir and Ladakh High Court', portalUrl: 'https://jkhighcourt.nic.in/' },
  { category: 'High Court', name: 'Jharkhand High Court', portalUrl: 'https://jharkhandhighcourt.nic.in/' },
  { category: 'High Court', name: 'Kerala High Court', portalUrl: 'https://highcourtofkerala.nic.in/' },
  { category: 'High Court', name: 'Madhya Pradesh High Court', portalUrl: 'https://mphc.gov.in/' },
  { category: 'High Court', name: 'Madras High Court', portalUrl: 'https://www.mhc.tn.gov.in/' },
  { category: 'High Court', name: 'Manipur High Court', portalUrl: 'https://hcmimphal.nic.in/' },
  { category: 'High Court', name: 'Meghalaya High Court', portalUrl: 'https://meghalayahighcourt.nic.in/' },
  { category: 'High Court', name: 'Orissa High Court', portalUrl: 'https://orissahighcourt.nic.in/' },
  { category: 'High Court', name: 'Patna High Court', portalUrl: 'https://patnahighcourt.gov.in/' },
  { category: 'High Court', name: 'Punjab and Haryana High Court', portalUrl: 'https://phhc.gov.in/' },
  { category: 'High Court', name: 'Rajasthan High Court', portalUrl: 'https://hcraj.nic.in/' },
  { category: 'High Court', name: 'Sikkim High Court', portalUrl: 'https://hcs.gov.in/' },
  { category: 'High Court', name: 'Telangana High Court', portalUrl: 'https://tshc.gov.in/' },
  { category: 'High Court', name: 'Tripura High Court', portalUrl: 'https://thc.nic.in/' },
  { category: 'High Court', name: 'Uttarakhand High Court', portalUrl: 'https://highcourtofuttarakhand.gov.in/' },
];

const NCLT_PORTAL = 'https://nclt.gov.in/';
const NCLT_BENCHES = [
  'New Delhi (Principal)',
  'Ahmedabad',
  'Allahabad',
  'Amaravati',
  'Bengaluru',
  'Chandigarh',
  'Chennai',
  'Cuttack',
  'Guwahati',
  'Hyderabad',
  'Indore',
  'Jaipur',
  'Kochi',
  'Kolkata',
  'Mumbai',
].map((bench) => ({
  category: 'NCLT',
  name: `NCLT ${bench}`,
  portalUrl: NCLT_PORTAL,
}));

const NCLAT_PORTAL = 'https://nclat.nic.in/';
const NCLAT_BENCHES = [
  { category: 'NCLAT', name: 'NCLAT New Delhi (Principal)', portalUrl: NCLAT_PORTAL },
  { category: 'NCLAT', name: 'NCLAT Chennai', portalUrl: NCLAT_PORTAL },
];

const DRT_PORTAL = 'https://drt.gov.in/';
const DRT_BENCHES = [
  'Ahmedabad',
  'Allahabad',
  'Aurangabad',
  'Bangalore I',
  'Bangalore II',
  'Chandigarh',
  'Chennai I',
  'Chennai II',
  'Chennai III',
  'Coimbatore',
  'Cuttack',
  'Delhi I',
  'Delhi II',
  'Delhi III',
  'Ernakulam',
  'Guwahati',
  'Hyderabad I',
  'Hyderabad II',
  'Jabalpur',
  'Jaipur',
  'Kolkata I',
  'Kolkata II',
  'Kolkata III',
  'Lucknow',
  'Madurai',
  'Mumbai I',
  'Mumbai II',
  'Mumbai III',
  'Nagpur',
  'Patna',
  'Pune',
  'Ranchi',
  'Visakhapatnam',
].map((bench) => ({
  category: 'DRT',
  name: `DRT ${bench}`,
  portalUrl: DRT_PORTAL,
}));

const DRAT_PORTAL = 'https://drat.gov.in/';
const DRAT_BENCHES = ['Allahabad', 'Chennai', 'Delhi', 'Kolkata', 'Mumbai'].map((bench) => ({
  category: 'DRAT',
  name: `DRAT ${bench}`,
  portalUrl: DRAT_PORTAL,
}));

const ITAT_PORTAL = 'https://itat.gov.in/';
const ITAT_BENCHES = [
  'Agra',
  'Ahmedabad',
  'Allahabad',
  'Amritsar',
  'Bangalore',
  'Bilaspur',
  'Chandigarh',
  'Chennai',
  'Cochin',
  'Cuttack',
  'Dehradun',
  'Delhi',
  'Guwahati',
  'Hyderabad',
  'Indore',
  'Jabalpur',
  'Jaipur',
  'Jodhpur',
  'Kolkata',
  'Lucknow',
  'Mumbai',
  'Nagpur',
  'Panaji',
  'Patna',
  'Pune',
  'Raipur',
  'Rajkot',
  'Ranchi',
  'Surat',
  'Varanasi',
  'Visakhapatnam',
].map((bench) => ({
  category: 'ITAT',
  name: `ITAT ${bench}`,
  portalUrl: ITAT_PORTAL,
}));

const CESTAT_PORTAL = 'https://cestat.gov.in/';
const CESTAT_BENCHES = [
  'New Delhi (Principal)',
  'Ahmedabad',
  'Allahabad',
  'Bangalore',
  'Chandigarh',
  'Chennai',
  'Hyderabad',
  'Kolkata',
  'Mumbai',
].map((bench) => ({
  category: 'CESTAT',
  name: `CESTAT ${bench}`,
  portalUrl: CESTAT_PORTAL,
}));

const NGT_PORTAL = 'https://greentribunal.gov.in/';
const NGT_BENCHES = [
  { category: 'NGT', name: 'NGT Principal Bench (Delhi)', portalUrl: NGT_PORTAL },
  { category: 'NGT', name: 'NGT Central Zone (Bhopal)', portalUrl: NGT_PORTAL },
  { category: 'NGT', name: 'NGT Eastern Zone (Kolkata)', portalUrl: NGT_PORTAL },
  { category: 'NGT', name: 'NGT Southern Zone (Chennai)', portalUrl: NGT_PORTAL },
  { category: 'NGT', name: 'NGT Western Zone (Pune)', portalUrl: NGT_PORTAL },
];

const CAT_PORTAL = 'https://cgat.gov.in/';
const CAT_BENCHES = [
  'Principal Bench (Delhi)',
  'Ahmedabad',
  'Allahabad',
  'Bangalore',
  'Calcutta',
  'Chandigarh',
  'Chennai',
  'Cuttack',
  'Ernakulam',
  'Guwahati',
  'Hyderabad',
  'Jabalpur',
  'Jaipur',
  'Jammu / Srinagar',
  'Jodhpur',
  'Lucknow',
  'Mumbai',
  'Patna',
  'Ranchi',
].map((bench) => ({
  category: 'CAT',
  name: `CAT ${bench}`,
  portalUrl: CAT_PORTAL,
}));

const AFT_PORTAL = 'https://aftdelhi.nic.in/';
const AFT_BENCHES = [
  'Principal Bench (Delhi)',
  'Chandigarh',
  'Chennai',
  'Guwahati',
  'Jaipur',
  'Jabalpur',
  'Kochi',
  'Kolkata',
  'Lucknow',
  'Mumbai',
].map((bench) => ({
  category: 'AFT',
  name: `AFT ${bench}`,
  portalUrl: AFT_PORTAL,
}));

const STANDALONE_TRIBUNALS = [
  { category: 'Tribunal', name: 'SAT — Securities Appellate Tribunal (Mumbai)', portalUrl: 'https://sat.gov.in/' },
  { category: 'Tribunal', name: 'TDSAT — Telecom Disputes Tribunal (Delhi)', portalUrl: 'https://tdsat.gov.in/' },
  { category: 'Tribunal', name: 'CCI — Competition Commission of India (Delhi)', portalUrl: 'https://www.cci.gov.in/' },
  { category: 'Tribunal', name: 'CCI Appellate — NCLAT (Delhi)', portalUrl: NCLAT_PORTAL },
  { category: 'Tribunal', name: 'Customs Authority for Advance Rulings (Delhi)', portalUrl: 'https://www.cbic.gov.in/' },
  { category: 'Tribunal', name: 'GST Appellate Tribunal', portalUrl: 'https://gstcouncil.gov.in/' },
];

const OTHERS = [
  // District courts are now auto-monitored via the eCourts adapter (registered
  // in server/adapters.js) — they show up in the picker's "Supported portals"
  // group automatically. Don't list a duplicate manual-tracking entry here.
  { category: 'Other', name: 'Consumer Forum — NCDRC (National)', portalUrl: 'https://confonet.nic.in/' },
  { category: 'Other', name: 'Consumer Forum — SCDRC (State)', portalUrl: 'https://confonet.nic.in/' },
  { category: 'Other', name: 'Consumer Forum — DCDRC (District)', portalUrl: 'https://confonet.nic.in/' },
  { category: 'Other', name: 'Family Court (state portal)', portalUrl: '' },
  { category: 'Other', name: 'Labour Court (state portal)', portalUrl: '' },
];

export const KNOWN_COURTS = [
  ...SUPREME,
  ...HIGH_COURTS,
  // NCLT and NCLAT benches removed — covered by the auto-monitor adapters
  // (registered in server/adapters.js).
  // ...NCLT_BENCHES,
  // ...NCLAT_BENCHES,
  // DRT and DRAT benches removed from manual-tracking catalog — they're now
  // covered by the auto-monitor "DRT / DRAT" portal (registered in server/adapters.js),
  // which fetches the live bench list from drt.gov.in and selects a specific bench
  // dynamically when adding a case.
  ...ITAT_BENCHES,
  ...CESTAT_BENCHES,
  ...NGT_BENCHES,
  ...CAT_BENCHES,
  ...AFT_BENCHES,
  ...STANDALONE_TRIBUNALS,
  ...OTHERS,
];

export const COURT_CATEGORY_ORDER = [
  'Apex court',
  'High Court',
  'NCLT',
  'NCLAT',
  'DRT',
  'DRAT',
  'ITAT',
  'CESTAT',
  'NGT',
  'CAT',
  'AFT',
  'Tribunal',
  'Other',
];

export function slugifyCourt(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function knownCourtByName(name) {
  const target = String(name || '').toLowerCase();
  return KNOWN_COURTS.find((court) => court.name.toLowerCase() === target) || null;
}
