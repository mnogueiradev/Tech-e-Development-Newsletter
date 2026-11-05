function positiveInteger(value, fallback, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    if (value == null || value === '') return fallback;
    throw new TypeError(`${name} deve ser um inteiro positivo.`);
  }
  return parsed;
}

function validateTimeZone(timezone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new TypeError(`Fuso horário inválido: ${timezone}`); }
}

function parseSchedules(raw, defaultTimezone, defaultTime) {
  const schedules = raw ? JSON.parse(raw) : [{ id: 'default', timezone: defaultTimezone, time: defaultTime }];
  if (!Array.isArray(schedules) || schedules.length === 0) throw new TypeError('EDITORIAL_PUBLICATION_SCHEDULES deve ser uma lista não vazia.');
  const seen = new Set();
  return schedules.map((schedule, index) => {
    const id = String(schedule.id || `schedule-${index + 1}`).trim();
    const timezone = String(schedule.timezone || defaultTimezone).trim();
    const time = String(schedule.time || defaultTime).trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new TypeError(`ID de schedule inválido: ${id}`);
    if (seen.has(id)) throw new TypeError(`ID de schedule repetido: ${id}`);
    seen.add(id);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new TypeError(`Horário de publicação inválido: ${time}`);
    validateTimeZone(timezone);
    return { id, timezone, time };
  });
}

function loadEditorialDiscoverySchedule(env = process.env) {
  const timezone = env.EDITORIAL_PUBLICATION_TIMEZONE || 'America/Sao_Paulo';
  const time = env.EDITORIAL_PUBLICATION_TIME || '08:00';
  validateTimeZone(timezone);
  return {
    enabled: env.EDITORIAL_DISCOVERY_ENABLED === 'true',
    leadHours: positiveInteger(env.EDITORIAL_DISCOVERY_LEAD_HOURS, 24, 'EDITORIAL_DISCOVERY_LEAD_HOURS'),
    maxDurationMinutes: positiveInteger(env.EDITORIAL_DISCOVERY_MAX_DURATION_MINUTES, 30, 'EDITORIAL_DISCOVERY_MAX_DURATION_MINUTES'),
    maxAttempts: positiveInteger(env.EDITORIAL_DISCOVERY_MAX_ATTEMPTS, 3, 'EDITORIAL_DISCOVERY_MAX_ATTEMPTS'),
    retryDelayMinutes: positiveInteger(env.EDITORIAL_DISCOVERY_RETRY_DELAY_MINUTES, 15, 'EDITORIAL_DISCOVERY_RETRY_DELAY_MINUTES'),
    pollCron: env.EDITORIAL_DISCOVERY_POLL_CRON || '* * * * *',
    schedules: parseSchedules(env.EDITORIAL_PUBLICATION_SCHEDULES, timezone, time)
  };
}

module.exports = { loadEditorialDiscoverySchedule, parseSchedules, validateTimeZone };
