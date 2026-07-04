const cron = require('node-cron');

const { getAdapterForCase } = require('./adapters');

const DEFAULT_SCHEDULE = '0 8,18 * * *';

const activeJobs = new Map();

function buildScheduleFor(savedCase) {
  if (savedCase.schedule && cron.validate(savedCase.schedule)) {
    return savedCase.schedule;
  }
  return DEFAULT_SCHEDULE;
}

async function runCaseFetch(savedCase, { onResult } = {}) {
  let result;

  const adapter = getAdapterForCase(savedCase);

  if (!adapter) {
    result = {
      error: savedCase.sourceUrl
        ? `No adapter is connected yet for ${savedCase.sourceUrl}`
        : 'Saved case has no portal URL — cannot fetch',
      fetchedAt: new Date().toISOString(),
      ok: false,
      skipped: true,
    };
  } else {
    result = await adapter.fetch(savedCase);
  }

  if (onResult) {
    try {
      await onResult(savedCase, result);
    } catch (handlerError) {
      console.error(
        `[scheduler] onResult handler failed for ${savedCase.id}: ${handlerError.message}`,
      );
    }
  }

  if (result.ok) {
    const nextDate = result.caseStatus && result.caseStatus.nextHearingDate;
    console.log(
      `[scheduler] ${savedCase.id} ok — next hearing: ${nextDate || 'not shown'}`,
    );
  } else if (!result.skipped) {
    console.warn(`[scheduler] ${savedCase.id} failed: ${result.error}`);
  }

  return result;
}

function syncScheduledJobs(savedCases, { onResult } = {}) {
  const schedulable = savedCases.filter(
    (savedCase) => savedCase.status !== 'unsupported_portal' && getAdapterForCase(savedCase),
  );
  const wantedIds = new Set(schedulable.map((sc) => sc.id));

  for (const [caseId, job] of activeJobs) {
    if (!wantedIds.has(caseId)) {
      job.task.stop();
      activeJobs.delete(caseId);
      console.log(`[scheduler] Stopped job for removed/unsupported case ${caseId}`);
    }
  }

  for (const savedCase of schedulable) {
    const desiredSchedule = buildScheduleFor(savedCase);
    const existing = activeJobs.get(savedCase.id);

    if (existing && existing.schedule === desiredSchedule) {
      existing.savedCase = savedCase;
      continue;
    }

    if (existing) {
      existing.task.stop();
    }

    const entry = { savedCase, schedule: desiredSchedule, task: null };
    entry.task = cron.schedule(desiredSchedule, () => {
      runCaseFetch(entry.savedCase, { onResult }).catch((error) => {
        console.error(`[scheduler] ${entry.savedCase.id} crashed: ${error.message}`);
      });
    });

    activeJobs.set(savedCase.id, entry);
    console.log(`[scheduler] Scheduled ${savedCase.id} at "${desiredSchedule}"`);
  }
}

async function runAllCasesNow(savedCases, { onResult } = {}) {
  const results = [];
  for (const savedCase of savedCases) {
    try {
      const result = await runCaseFetch(savedCase, { onResult });
      results.push({
        caseId: savedCase.id,
        error: result.error || '',
        ok: result.ok,
        skipped: Boolean(result.skipped),
      });
    } catch (error) {
      results.push({
        caseId: savedCase.id,
        error: error.message,
        ok: false,
        skipped: false,
      });
    }
  }
  return results;
}

function stopAll() {
  for (const [, job] of activeJobs) {
    job.task.stop();
  }
  activeJobs.clear();
}

function listScheduledJobs() {
  return Array.from(activeJobs.entries()).map(([caseId, entry]) => ({
    caseId,
    schedule: entry.schedule,
  }));
}

module.exports = {
  DEFAULT_SCHEDULE,
  listScheduledJobs,
  runAllCasesNow,
  runCaseFetch,
  stopAll,
  syncScheduledJobs,
};
