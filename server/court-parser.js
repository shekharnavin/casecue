function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|tr|td|th|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\r\f\v]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim(),
  );
}

function cleanValue(value) {
  return value.replace(/\s+/g, ' ').replace(/^[:\-]\s*/, '').trim();
}

function extractBetween(text, label, nextLabels) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedNext = nextLabels
    .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(`${escapedLabel}\\s*([\\s\\S]*?)(?=${escapedNext}|$)`, 'i');
  const match = text.match(pattern);
  return match ? cleanValue(match[1]) : '';
}

function parseCaseStatus(html) {
  const text = htmlToText(html);
  const compactText = text.replace(/\s+/g, ' ').trim();
  const labels = [
    'Status:',
    'Case Number:',
    'Classification:',
    'Date of Filing:',
    'Petitioner:',
    'Petitioner Advocate:',
    'Respondent:',
    'Respondent Advocate:',
    'Filing No.:',
    'Judge:',
    'Last Posted For:',
    'Date of Decision:',
    'Last Action Taken:',
    'Next Hearing Date:',
    'Prayer Information',
    'History of Case Hearing',
    'Business',
  ];

  function pick(label) {
    return extractBetween(
      compactText,
      label,
      labels.filter((item) => item !== label),
    );
  }

  const caseNumberBlock = pick('Case Number:');
  const cnrMatch = caseNumberBlock.match(/\(([A-Z0-9]+)\)/i);

  return {
    caseNumber: cleanValue(caseNumberBlock.replace(/\([A-Z0-9]+\)/i, '')),
    classification: pick('Classification:'),
    cnrNumber: cnrMatch ? cnrMatch[1] : '',
    dateOfDecision: pick('Date of Decision:'),
    filingDate: pick('Date of Filing:'),
    filingNumber: pick('Filing No.:'),
    judge: pick('Judge:'),
    lastActionTaken: pick('Last Action Taken:'),
    lastPostedFor: pick('Last Posted For:'),
    nextHearingDate: pick('Next Hearing Date:'),
    petitioner: pick('Petitioner:'),
    petitionerAdvocate: pick('Petitioner Advocate:'),
    rawText: text,
    respondent: pick('Respondent:'),
    respondentAdvocate: pick('Respondent Advocate:'),
    status: pick('Status:'),
  };
}

function parseOptions(html) {
  const options = [];
  const pattern = /<option\s+value=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/option>/gi;
  let match;

  while ((match = pattern.exec(html))) {
    const value = decodeHtml(match[1]).trim();
    const label = cleanValue(decodeHtml(match[2].replace(/<[^>]+>/g, ' ')));
    if (value && value !== '0') {
      options.push({ id: value, name: label });
    }
  }

  return options;
}

module.exports = {
  cleanValue,
  decodeHtml,
  extractBetween,
  htmlToText,
  parseCaseStatus,
  parseOptions,
};
