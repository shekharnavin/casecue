import * as XLSX from 'xlsx';

// Column headers used in the downloadable template and matched (case-insensitively)
// when parsing an uploaded file.
const TEMPLATE_HEADERS = ['Name', 'Email', 'Phone', 'Password'];

// Generate and download a sample .xlsx the user fills in and re-uploads.
export function downloadUserTemplate() {
  const exampleRows = [
    { Name: 'Ramesh Kumar', Email: 'ramesh@example.com', Phone: '9886510432', Password: '' },
    { Name: 'Priya Sharma', Email: 'priya@example.com', Phone: '9123456780', Password: '' },
  ];
  const worksheet = XLSX.utils.json_to_sheet(exampleRows, { header: TEMPLATE_HEADERS });
  worksheet['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 18 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipients');
  XLSX.writeFile(workbook, 'CaseCue-recipients-template.xlsx');
}

function pickCell(row, aliases) {
  for (const key of Object.keys(row)) {
    if (aliases.includes(String(key).trim().toLowerCase())) {
      return String(row[key] ?? '').trim();
    }
  }
  return '';
}

// Read an uploaded .xlsx / .xls / .csv file and return normalized recipient rows.
export async function parseUsersFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    return [];
  }
  const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  return rawRows.map((row) => ({
    email: pickCell(row, ['email', 'email id', 'e-mail', 'mail']),
    name: pickCell(row, ['name', 'full name', 'recipient', 'recipient name']),
    password: pickCell(row, ['password', 'pass']),
    phone: pickCell(row, ['phone', 'phone number', 'mobile', 'contact', 'phone no']),
  }));
}
