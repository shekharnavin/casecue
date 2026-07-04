const {
  ALPHANUMERIC_CHARSET,
  NUMERIC_CHARSET,
  solveWithTesseract,
} = require('./tesseract-solver');

const TWOCAPTCHA_API_BASE = 'https://2captcha.com';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 24;

const DEFAULT_MIN_CONFIDENCE = 65;

function lengthLooksValid(text, minLength, maxLength) {
  if (!text) {
    return false;
  }
  if (minLength && text.length < minLength) {
    return false;
  }
  if (maxLength && text.length > maxLength) {
    return false;
  }
  return true;
}

async function trySolveLocally(imageBuffer, options) {
  const { maxLength = 8, minConfidence = DEFAULT_MIN_CONFIDENCE, minLength = 4, numeric = true } = options;
  const charset = numeric ? NUMERIC_CHARSET : ALPHANUMERIC_CHARSET;

  try {
    const result = await solveWithTesseract(imageBuffer, { charset });
    const lengthOk = lengthLooksValid(result.text, minLength, maxLength);
    const charsetOk = numeric ? /^\d+$/.test(result.text) : /^[a-zA-Z0-9]+$/.test(result.text);
    const confidenceOk = result.confidence >= minConfidence;

    if (lengthOk && charsetOk && confidenceOk) {
      console.log(
        `[captcha] tesseract solved "${result.text}" (confidence ${result.confidence.toFixed(0)}%)`,
      );
      return result.text;
    }

    console.log(
      `[captcha] tesseract rejected ("${result.text}" len=${result.text.length} conf=${result.confidence.toFixed(0)}%) — trying 2Captcha next`,
    );
    return null;
  } catch (error) {
    console.warn(`[captcha] tesseract crashed: ${error.message} — trying 2Captcha next`);
    return null;
  }
}

async function solveWith2Captcha(imageBuffer, options) {
  const apiKey = process.env.TWOCAPTCHA_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Tesseract could not solve the captcha and TWOCAPTCHA_API_KEY is not set. ' +
        'Either set the key in server/.env or wait for the next scheduled retry.',
    );
  }

  const { maxLength = 8, minLength = 4, numeric = true } = options;

  const submitBody = new URLSearchParams({
    body: imageBuffer.toString('base64'),
    json: '1',
    key: apiKey,
    max_len: String(maxLength),
    method: 'base64',
    min_len: String(minLength),
    numeric: numeric ? '1' : '0',
  });

  const submitResponse = await fetch(`${TWOCAPTCHA_API_BASE}/in.php`, {
    body: submitBody,
    method: 'POST',
  });
  const submitJson = await submitResponse.json();

  if (submitJson.status !== 1) {
    throw new Error(`2Captcha submit failed: ${submitJson.request || 'unknown error'}`);
  }

  const captchaId = submitJson.request;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const pollUrl = `${TWOCAPTCHA_API_BASE}/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`;
    const pollResponse = await fetch(pollUrl);
    const pollJson = await pollResponse.json();

    if (pollJson.status === 1) {
      const text = String(pollJson.request).trim();
      console.log(`[captcha] 2Captcha solved "${text}"`);
      return text;
    }

    if (pollJson.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha poll error: ${pollJson.request}`);
    }
  }

  throw new Error('2Captcha timed out waiting for solution');
}

async function solveCaptcha(imageBuffer, options = {}) {
  const localResult = await trySolveLocally(imageBuffer, options);
  if (localResult) {
    return localResult;
  }

  return solveWith2Captcha(imageBuffer, options);
}

module.exports = { solveCaptcha };
