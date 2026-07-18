export const BUILT_IN_SCHEDULES = [
  { cron: '0 8 * * *', description: 'Once a day in the morning', label: 'Daily 8:00 AM' },
  { cron: '0 18 * * *', description: 'Once a day in the evening', label: 'Daily 6:00 PM' },
  { cron: '30 18 * * *', description: 'Once a day in the evening', label: 'Daily 6:30 PM' },
  { cron: '0 19 * * *', description: 'Once a day in the evening', label: 'Daily 7:00 PM' },
  { cron: '0 20 * * *', description: 'Once a day at night', label: 'Daily 8:00 PM' },
  { cron: '0 8,18 * * *', description: 'Twice a day (recommended)', label: 'Twice daily — 8 AM + 6 PM' },
  { cron: '0 */1 * * *', description: 'Every hour, on the hour', label: 'Every 1 hour' },
  { cron: '0 */6 * * *', description: 'Every 6 hours', label: 'Every 6 hours' },
  { cron: '*/15 * * * *', description: 'Every 15 minutes (frequent checking)', label: 'Every 15 minutes' },
];

export const DEFAULT_SCHEDULE_CRON = '0 8,18 * * *';

const TESTING_SCHEDULE_PATTERN = /^\*\/\d+ \* \* \* \*$/;

export function isTestingSchedule(cron) {
  return TESTING_SCHEDULE_PATTERN.test(String(cron || '').trim());
}

export function getAllSchedules(customSchedules = []) {
  const seen = new Set(BUILT_IN_SCHEDULES.map((schedule) => schedule.cron));
  const merged = [...BUILT_IN_SCHEDULES];

  for (const schedule of customSchedules) {
    if (!schedule || !schedule.cron || !schedule.label) {
      continue;
    }
    if (seen.has(schedule.cron)) {
      continue;
    }
    seen.add(schedule.cron);
    merged.push({
      cron: schedule.cron,
      custom: true,
      description: schedule.description || 'Custom schedule',
      id: schedule.id,
      label: schedule.label,
    });
  }

  return merged;
}

export function describeSchedule(cron, customSchedules = []) {
  if (!cron) {
    return '—';
  }
  const all = getAllSchedules(customSchedules);
  const match = all.find((option) => option.cron === cron);
  return match ? match.label : cron;
}
