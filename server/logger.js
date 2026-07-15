const fs = require('node:fs');
const path = require('node:path');

// Simple append-only file logger with timestamps + size-based rotation.
// Patches console.* so ALL existing server logs (startup, scheduler, captcha,
// change detection, email, errors) are persisted to a file that can be opened
// on a client machine to diagnose issues.

const MAX_BYTES = 5 * 1024 * 1024; // rotate at 5 MB
let stream = null;
let logFilePath = '';

function timestamp() {
  return new Date().toISOString();
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatArg(arg) {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  return safeStringify(arg);
}

function rotateIfNeeded(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_BYTES) {
      const previous = `${file}.1`;
      try {
        fs.rmSync(previous, { force: true });
      } catch {
        /* ignore */
      }
      fs.renameSync(file, previous);
    }
  } catch {
    /* file doesn't exist yet — nothing to rotate */
  }
}

function initLogging(dataDir) {
  const logDir = path.join(dataDir, 'logs');
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    /* fall back to console-only if the dir can't be created */
    return '';
  }

  logFilePath = path.join(logDir, 'casecue.log');
  rotateIfNeeded(logFilePath);
  stream = fs.createWriteStream(logFilePath, { flags: 'a' });

  const writeLine = (level, args) => {
    if (!stream) {
      return;
    }
    const line = `[${timestamp()}] [${level}] ${args.map(formatArg).join(' ')}\n`;
    try {
      stream.write(line);
    } catch {
      /* never let logging crash the app */
    }
  };

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args) => { original.log(...args); writeLine('INFO', args); };
  console.info = (...args) => { original.info(...args); writeLine('INFO', args); };
  console.warn = (...args) => { original.warn(...args); writeLine('WARN', args); };
  console.error = (...args) => { original.error(...args); writeLine('ERROR', args); };

  return logFilePath;
}

function getLogFilePath() {
  return logFilePath;
}

module.exports = { getLogFilePath, initLogging };
