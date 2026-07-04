const Tesseract = require('tesseract.js');

const NUMERIC_CHARSET = '0123456789';
const ALPHANUMERIC_CHARSET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

let workerPromise = null;
let activeCharset = '';

// In a packaged desktop build there is no internet-backed CDN cache to pull the
// language model from, so CASECUE_TESSDATA_DIR points at the folder holding the
// bundled `eng.traineddata`. When unset (running from source) tesseract.js keeps
// its default online behaviour. gzip:false because the bundled file is raw, not
// gzip-compressed.
function buildWorkerOptions() {
  const options = { logger: () => undefined };
  const tessdataDir = process.env.CASECUE_TESSDATA_DIR;
  if (tessdataDir) {
    options.langPath = tessdataDir;
    // Load straight from the bundled file every time; never write a cache copy
    // (the app folder is read-only when packaged).
    options.cacheMethod = 'none';
    options.gzip = false;
  }
  return options;
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker('eng', 1, buildWorkerOptions());
      // Initial parameters — single line of text. Charset is set per-call below.
      await worker.setParameters({
        tessedit_pageseg_mode: '7',
      });
      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function solveWithTesseract(imageBuffer, options = {}) {
  const charset = options.charset || NUMERIC_CHARSET;
  const worker = await getWorker();

  if (activeCharset !== charset) {
    await worker.setParameters({
      tessedit_char_whitelist: charset,
    });
    activeCharset = charset;
  }

  const result = await worker.recognize(imageBuffer);
  const rawText = (result && result.data && result.data.text) || '';
  const confidence = (result && result.data && result.data.confidence) || 0;

  // Filter to only the allowed charset (drops whitespace, line breaks, stray chars)
  const charsetSet = new Set(charset);
  const filtered = String(rawText)
    .split('')
    .filter((ch) => charsetSet.has(ch))
    .join('');

  return {
    confidence,
    rawText,
    text: filtered,
  };
}

async function terminateTesseract() {
  if (!workerPromise) {
    return;
  }
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    /* ignore — already terminated */
  } finally {
    workerPromise = null;
    activeCharset = '';
  }
}

module.exports = {
  ALPHANUMERIC_CHARSET,
  NUMERIC_CHARSET,
  solveWithTesseract,
  terminateTesseract,
};
