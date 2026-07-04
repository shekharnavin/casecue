// Run with: node server/test-ecourts.js [count]
// Fetches Securimage captchas from eCourts and tests Tesseract OCR accuracy.

const crypto = require('node:crypto');

const { ALPHANUMERIC_CHARSET, solveWithTesseract, terminateTesseract } = require('./tesseract-solver');

const ECOURTS_BASE = 'https://services.ecourts.gov.in';
const ECOURTS_HOME = '/ecourtindia_v6/?p=home/index';
const ECOURTS_CAPTCHA = '/ecourtindia_v6/vendor/securimage/securimage_show.php';

const ATTEMPTS = Number(process.argv[2] || 10);
const cookies = new Map();

function splitSetCookie(headerValue) {
  if (!headerValue) return [];
  if (Array.isArray(headerValue)) return headerValue;
  return String(headerValue).split(/,(?=\s*[^;,=\s]+=[^;,]*)/g);
}

function updateCookies(response) {
  const list = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : splitSetCookie(response.headers.get('set-cookie'));
  for (const line of list) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader() {
  return Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function fetchPath(path, headers = {}) {
  const response = await fetch(`${ECOURTS_BASE}${path}`, {
    headers: {
      Accept: '*/*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      ...headers,
    },
    redirect: 'manual',
  });
  updateCookies(response);
  return response;
}

(async () => {
  // Load home page for session cookies
  await fetchPath(ECOURTS_HOME, { Accept: 'text/html' });

  let passes = 0;
  let highConf = 0;
  const lengths = [];
  const samples = [];

  for (let i = 1; i <= ATTEMPTS; i += 1) {
    try {
      const response = await fetchPath(`${ECOURTS_CAPTCHA}?${Date.now()}-${i}`, {
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        Referer: `${ECOURTS_BASE}${ECOURTS_HOME}`,
      });
      if (!response.ok) {
        console.log(`  ${i}: HTTP ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      const t0 = Date.now();
      const result = await solveWithTesseract(buffer, { charset: ALPHANUMERIC_CHARSET });
      const elapsed = Date.now() - t0;

      const looksValid = /^[a-zA-Z0-9]{6}$/.test(result.text);
      if (looksValid) passes += 1;
      if (result.confidence >= 65) highConf += 1;
      lengths.push(result.text.length);
      samples.push({ text: result.text, confidence: result.confidence });

      console.log(
        `  ${String(i).padStart(2)}: "${result.text.padEnd(8)}" len=${result.text.length} conf=${result.confidence.toFixed(0)}% looksValid=${looksValid} (${elapsed}ms)`,
      );
    } catch (error) {
      console.log(`  ${i}: failed — ${error.message}`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  ${passes}/${ATTEMPTS} passed length+charset check (6 alphanumeric)`);
  console.log(`  ${highConf}/${ATTEMPTS} had confidence ≥ 65%`);
  const lengthDist = lengths.reduce((acc, l) => ((acc[l] = (acc[l] || 0) + 1), acc), {});
  console.log(`  length distribution:`, lengthDist);

  await terminateTesseract();
})().catch((error) => {
  console.error(error);
  terminateTesseract().finally(() => process.exit(1));
});
