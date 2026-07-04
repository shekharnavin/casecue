// Run with: node server/test-tesseract.js [count]
// Pulls real captchas from Karnataka HC and tests how well Tesseract reads them.

const { courtFetch, ensureCourtSession, getSession, COURT_BASE_URL } = require('./court-client');
const { solveWithTesseract, terminateTesseract } = require('./tesseract-solver');

const ATTEMPTS = Number(process.argv[2] || 10);

async function fetchOneCaptcha(session) {
  const response = await courtFetch(session, `/captcha.php?t=${Date.now()}`, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: `${COURT_BASE_URL}/casemenu.php`,
    },
  });
  if (!response.ok) {
    throw new Error(`Court captcha returned ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

(async () => {
  const session = getSession();
  await ensureCourtSession(session);

  let passes = 0;
  let highConf = 0;
  const lengths = [];

  for (let i = 1; i <= ATTEMPTS; i += 1) {
    try {
      const buffer = await fetchOneCaptcha(session);
      const t0 = Date.now();
      const result = await solveWithTesseract(buffer);
      const elapsed = Date.now() - t0;
      const numericOnly = /^\d+$/.test(result.text);
      const inRange = result.text.length >= 4 && result.text.length <= 8;
      const looksValid = numericOnly && inRange;
      if (looksValid) passes += 1;
      if (result.confidence >= 65) highConf += 1;
      lengths.push(result.text.length);
      console.log(
        `  ${i.toString().padStart(2)}: "${result.text.padEnd(8)}" len=${result.text.length} conf=${result.confidence.toFixed(0)}% looksValid=${looksValid} (${elapsed}ms)`,
      );
    } catch (error) {
      console.log(`  ${i}: failed — ${error.message}`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  ${passes}/${ATTEMPTS} passed length+charset check`);
  console.log(`  ${highConf}/${ATTEMPTS} had confidence ≥ 65%`);
  if (lengths.length) {
    const lengthCounts = lengths.reduce((acc, l) => ((acc[l] = (acc[l] || 0) + 1), acc), {});
    console.log(`  length distribution:`, lengthCounts);
  }

  await terminateTesseract();
})().catch((error) => {
  console.error(error);
  terminateTesseract().finally(() => process.exit(1));
});
