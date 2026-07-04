const nodemailer = require('nodemailer');

let cachedTransporter = null;
let cachedConfigFingerprint = '';

// SMTP settings saved from the app's Settings page (persisted in the data file).
// When present, these take precedence over environment variables so a packaged
// desktop app can be configured entirely from the UI. Env vars remain the
// fallback for running from source.
let runtimeConfig = null;

function setSmtpConfig(config) {
  if (!config || typeof config !== 'object') {
    runtimeConfig = null;
    return;
  }
  const host = String(config.host || '').trim();
  const user = String(config.user || '').trim();
  const pass = String(config.pass || '');
  const from = String(config.from || '').trim();
  const port = Number(config.port) || 0;

  if (!host || !user || !pass) {
    runtimeConfig = null;
    return;
  }

  runtimeConfig = { from, host, pass, port: port || 587, user };
}

function getEffectiveConfig() {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!host || !user || !pass) {
    return null;
  }
  return {
    from: process.env.SMTP_FROM || '',
    host,
    pass,
    port: Number(process.env.SMTP_PORT || 587),
    user,
  };
}

function getConfigFingerprint() {
  const config = getEffectiveConfig();
  if (!config) {
    return '';
  }
  return [config.host, config.port, config.user, config.pass].join('|');
}

function isEmailConfigured() {
  return Boolean(getEffectiveConfig());
}

function getFromAddress() {
  const config = getEffectiveConfig();
  if (!config) {
    return 'casecue@localhost';
  }
  return config.from || config.user || 'casecue@localhost';
}

function buildTransporter() {
  const fingerprint = getConfigFingerprint();

  if (cachedTransporter && cachedConfigFingerprint === fingerprint) {
    return cachedTransporter;
  }

  const config = getEffectiveConfig();
  if (!config) {
    cachedTransporter = null;
    cachedConfigFingerprint = '';
    return null;
  }

  const port = Number(config.port || 587);
  cachedTransporter = nodemailer.createTransport({
    auth: {
      pass: config.pass,
      user: config.user,
    },
    host: config.host,
    port,
    secure: port === 465,
  });
  cachedConfigFingerprint = fingerprint;
  return cachedTransporter;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSubject(context, result, { changes = [], isFirstFetch = false, isTestMode = false } = {}) {
  if (isTestMode) {
    return `[TEST] ${context.caseReference} — scheduler heartbeat`;
  }

  if (isFirstFetch) {
    return `${context.caseReference} — tracking started`;
  }

  const hearingChange = changes.find((change) => change.field === 'nextHearingDate');
  if (hearingChange) {
    return `${context.caseReference} — next hearing ${hearingChange.after || 'updated'}`;
  }

  const statusChange = changes.find((change) => change.field === 'status');
  if (statusChange) {
    return `${context.caseReference} — status: ${statusChange.after || 'updated'}`;
  }

  if (changes.length) {
    return `${context.caseReference} — ${changes.length} update${changes.length === 1 ? '' : 's'}`;
  }

  const next = result.caseStatus && result.caseStatus.nextHearingDate;
  return `${context.caseReference} — ${next ? `next hearing ${next}` : 'hearing update'}`;
}

function buildTextBody(savedCase, result, context, { changes = [], isFirstFetch = false, isTestMode = false } = {}) {
  const caseStatus = result.caseStatus || {};
  const lines = ['CaseCue Hearing Update', '------------------------------'];

  if (isTestMode) {
    lines.push('TEST MODE — this email was sent because the case is on a testing schedule.');
    lines.push('Change the schedule to a daily/hourly one to stop these test emails.');
    lines.push('');
  } else if (isFirstFetch) {
    lines.push('Tracking started for this case. Future emails will only arrive when something changes.');
    lines.push('');
  } else if (changes.length) {
    lines.push('What changed since last check:');
    for (const change of changes) {
      lines.push(`  - ${change.label}: ${change.before || '(empty)'} → ${change.after || '(empty)'}`);
    }
    lines.push('');
  }

  lines.push(
    `Case: ${context.caseReference}`,
    `Court: ${context.courtName}`,
    `Bench: ${context.benchName}`,
    '',
    `Next Hearing Date: ${caseStatus.nextHearingDate || 'Not shown'}`,
    `Purpose: ${caseStatus.lastPostedFor || '-'}`,
    `Status: ${caseStatus.status || '-'}`,
    `Before: ${caseStatus.judge || '-'}`,
    '',
    `Petitioner: ${caseStatus.petitioner || '-'}`,
    `Respondent: ${caseStatus.respondent || '-'}`,
    `Petitioner Advocate: ${caseStatus.petitionerAdvocate || '-'}`,
    '',
    `Fetched at: ${result.fetchedAt}`,
    `Source: ${savedCase.sourceUrl || result.source || ''}`,
  );
  return lines.join('\n');
}

function buildChangesBannerHtml({ changes = [], isFirstFetch = false, isTestMode = false } = {}) {
  if (isTestMode) {
    return `
      <div style="background:#FFF1E6;border:1px solid #F5C68C;color:#7A3E00;padding:12px 14px;border-radius:6px;margin-bottom:16px;font-size:14px;">
        <strong>Test mode</strong> — this email fired because the case is on a testing schedule (every-N-minutes).
        Switch to a daily / hourly schedule to stop these test emails.
      </div>`;
  }

  if (isFirstFetch) {
    return `
      <div style="background:#EAF4FF;border:1px solid #C8DEF5;color:#0F4A8A;padding:12px 14px;border-radius:6px;margin-bottom:16px;font-size:14px;">
        <strong>Tracking started</strong> — you'll receive future emails only when something changes.
      </div>`;
  }

  if (!changes.length) {
    return '';
  }

  const rows = changes
    .map(
      (change) => `
        <tr>
          <td style="padding:4px 12px 4px 0;color:#6F7C8F;">${escapeHtml(change.label)}</td>
          <td style="padding:4px 0;color:#14253A;">
            <span style="color:#9AA5B5;text-decoration:line-through;">${escapeHtml(change.before || '(empty)')}</span>
            &nbsp;→&nbsp;
            <strong style="color:#1C7B3F;">${escapeHtml(change.after || '(empty)')}</strong>
          </td>
        </tr>`,
    )
    .join('');

  return `
    <div style="background:#FFF8E6;border:1px solid #F0DBA3;padding:14px;border-radius:6px;margin-bottom:18px;">
      <div style="font-weight:600;color:#7A5D00;margin-bottom:8px;">What changed</div>
      <table style="font-size:14px;border-collapse:collapse;">${rows}</table>
    </div>`;
}

function buildHtmlBody(savedCase, result, context, diff = {}) {
  const caseStatus = result.caseStatus || {};
  const rows = [
    ['Next Hearing', caseStatus.nextHearingDate || 'Not shown'],
    ['Purpose', caseStatus.lastPostedFor || '-'],
    ['Status', caseStatus.status || '-'],
    ['Before', caseStatus.judge || '-'],
    ['Petitioner', caseStatus.petitioner || '-'],
    ['Respondent', caseStatus.respondent || '-'],
    ['Petitioner Advocate', caseStatus.petitionerAdvocate || '-'],
  ]
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6F7C8F; vertical-align: top;">${escapeHtml(label)}</td>
          <td style="padding: 6px 0; color: #14253A;"><strong>${escapeHtml(value)}</strong></td>
        </tr>`,
    )
    .join('');

  const sourceUrl = savedCase.sourceUrl || result.source || '';
  const banner = buildChangesBannerHtml(diff);

  return `
<div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; max-width: 600px; color: #14253A;">
  <div style="background:#153D56;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0;font-weight:600;letter-spacing:0.4px;">
    CaseCue Hearing Update
  </div>
  <div style="border:1px solid #E1E6EE;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <h2 style="margin:0 0 4px 0;color:#153D56;font-size:20px;">${escapeHtml(context.caseReference)}</h2>
    <div style="color:#6F7C8F;font-size:14px;margin-bottom:18px;">
      ${escapeHtml(context.courtName)} &middot; ${escapeHtml(context.benchName)}
    </div>
    ${banner}
    <table style="font-size:14px;border-collapse:collapse;">${rows}</table>
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid #EEF1F6;color:#8895A8;font-size:12px;">
      Fetched at ${escapeHtml(result.fetchedAt)}<br>
      ${sourceUrl ? `Source: <a href="${escapeHtml(sourceUrl)}" style="color:#3B6EA8;">${escapeHtml(sourceUrl)}</a>` : ''}
    </div>
  </div>
</div>`.trim();
}

async function sendCaseUpdateEmail({
  changes = [],
  context,
  isFirstFetch = false,
  isTestMode = false,
  recipients,
  result,
  savedCase,
}) {
  if (!recipients || !recipients.length) {
    return { ok: false, reason: 'No recipients configured for this case' };
  }

  if (!isEmailConfigured()) {
    return { ok: false, reason: 'SMTP credentials not set in server/.env' };
  }

  const transporter = buildTransporter();
  if (!transporter) {
    return { ok: false, reason: 'SMTP transporter could not be created' };
  }

  const toAddresses = recipients
    .map((recipient) => recipient.email && recipient.email.trim())
    .filter(Boolean);

  if (!toAddresses.length) {
    return { ok: false, reason: 'Recipients have no email addresses' };
  }

  const diff = { changes, isFirstFetch, isTestMode };
  const subject = buildSubject(context, result, diff);
  const text = buildTextBody(savedCase, result, context, diff);
  const html = buildHtmlBody(savedCase, result, context, diff);

  const info = await transporter.sendMail({
    from: getFromAddress(),
    html,
    subject,
    text,
    to: toAddresses.join(', '),
  });

  return {
    messageId: info.messageId,
    ok: true,
    recipients: toAddresses,
  };
}

async function sendTestEmail(toEmail) {
  if (!isEmailConfigured()) {
    throw new Error('SMTP credentials not set in server/.env');
  }

  const transporter = buildTransporter();
  if (!transporter) {
    throw new Error('SMTP transporter could not be created');
  }

  const info = await transporter.sendMail({
    from: getFromAddress(),
    html: '<p>This is a test email from <strong>CaseCue</strong>. If you can read this, your SMTP credentials are working.</p>',
    subject: 'CaseCue SMTP test',
    text: 'This is a test email from CaseCue. If you can read this, your SMTP credentials are working.',
    to: toEmail,
  });

  return {
    messageId: info.messageId,
    ok: true,
  };
}

module.exports = {
  isEmailConfigured,
  sendCaseUpdateEmail,
  sendTestEmail,
  setSmtpConfig,
};
