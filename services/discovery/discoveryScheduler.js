const cronDefault = require('node-cron');
const defaultConfig = require('../../config/editorialDiscoverySchedule');
const EditorialDiscoveryRunRepository = require('../../repositories/editorialDiscoveryRunRepository');
const { discoverNews } = require('./discoveryService');

function localDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addLocalDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function zonedLocalDateTimeToUtc(dateString, time, timezone) {
  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = targetUtc;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(part => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    candidate += targetUtc - represented;
  }
  const result = new Date(candidate);
  if (localDateParts(result, timezone) !== dateString) throw new RangeError(`Horário local inexistente em ${dateString} (${timezone}).`);
  const parts = Object.fromEntries(formatter.formatToParts(result).map(part => [part.type, part.value]));
  if (Number(parts.hour) !== hour || Number(parts.minute) !== minute) throw new RangeError(`Horário local ambíguo ou inexistente em ${dateString} (${timezone}).`);
  return result;
}

function dueSchedules({ schedules, now, leadHours }) {
  const due = [];
  for (const schedule of schedules) {
    const today = localDateParts(now, schedule.timezone);
    for (const editionDate of [today, addLocalDays(today, 1)]) {
      const publicationAt = zonedLocalDateTimeToUtc(editionDate, schedule.time, schedule.timezone);
      const discoveryAt = new Date(publicationAt.getTime() - leadHours * 60 * 60 * 1000);
      if (now >= discoveryAt && now < publicationAt) {
        due.push({ schedule, editionDate, publicationAt, discoveryAt });
      }
    }
  }
  return due;
}

function abortError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function raceWithAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason || new Error('Descoberta cancelada.'));
  const aborted = new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason || new Error('Descoberta cancelada.')), { once: true });
  });
  return Promise.race([promise, aborted]);
}

async function executeClaimedRun({ pool, repository, discover, due, lock, config, now, logger,
  publishedAfter = due.discoveryAt, publishedBefore = null, manual = false }) {
  const { schedule, editionDate } = due;
  const leaseSeconds = (config.maxDurationMinutes + 5) * 60;
  const persistenceLease = { scheduleId: schedule.id, editionDate, timezone: schedule.timezone, lockToken: lock.lockToken };
  const controller = new AbortController();
  const startedAt = Date.now();
  let heartbeatBusy = false;
  const context = { schedule, editionDate, attempt: lock.attempt, manual };
  const abortForLeaseLoss = () => controller.abort(abortError('DISCOVERY_LEASE_LOST', 'A execução perdeu a posse do lease editorial.'));
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy || controller.signal.aborted) return;
    heartbeatBusy = true;
    try {
      const renewed = await repository.renew({ ...persistenceLease, leaseSeconds });
      if (!renewed) abortForLeaseLoss();
    } catch (error) {
      logger.error(`[EDITORIAL DISCOVERY] Falha ao renovar lease ${schedule.id}/${editionDate}: ${error.message}`);
      abortForLeaseLoss();
    } finally { heartbeatBusy = false; }
  }, Math.max(1000, Math.floor((leaseSeconds * 1000) / 3)));
  const timeout = setTimeout(() => controller.abort(abortError('DISCOVERY_TIMEOUT', 'Duração máxima da descoberta excedida.')),
    config.maxDurationMinutes * 60 * 1000);

  logger.info(`[EDITORIAL DISCOVERY] Início ${schedule.id}/${editionDate} tentativa ${lock.attempt}${manual ? ' (manual)' : ''}.`);
  const discoveryPromise = Promise.resolve().then(() => discover({
    pool, publishedAfter, publishedBefore: publishedBefore || now(), persist: true,
    signal: controller.signal, persistenceLease, schedule, editionDate
  }));
  try {
    // Race the worker against timeout/lease loss. Any late writer still has to pass the
    // transaction-level lease fence before each article insert.
    const summary = await raceWithAbort(discoveryPromise, controller.signal);
    if (summary.failures > 0) {
      const failure = new Error(`Brave reportou ${summary.failures} falha(s) em consultas.`);
      failure.summary = summary;
      throw failure;
    }
    const durationMs = Date.now() - startedAt;
    const status = summary.status === 'partial' ? 'completed_with_warnings' : 'completed';
    const saved = await repository.complete({ ...persistenceLease, status, summary, durationMs });
    if (!saved) throw abortError('DISCOVERY_LEASE_LOST', 'O lease expirou antes de concluir a descoberta.');
    logger.info(`[EDITORIAL DISCOVERY] Fim ${schedule.id}/${editionDate}: ${summary.newArticles || 0} novas, ${summary.duplicates || 0} duplicadas, ${durationMs}ms.`);
    return { ...context, summary, status, durationMs };
  } catch (error) {
    if (!controller.signal.aborted) controller.abort(error);
    // The runner may still be settling, but its next transaction is fenced by the run row.
    void discoveryPromise.catch(() => {});
    const durationMs = Date.now() - startedAt;
    await repository.fail({ ...persistenceLease, error, summary: error.summary || {},
      retryDelayMinutes: config.retryDelayMinutes, durationMs });
    logger.error(`[EDITORIAL DISCOVERY] Falha ${schedule.id}/${editionDate} após ${durationMs}ms: ${error.message}`);
    return { ...context, error, status: 'failed', durationMs };
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout);
  }
}

function createDiscoveryScheduler({ pool, config = defaultConfig.loadEditorialDiscoverySchedule(), cron = cronDefault,
  repository = null, discover = discoverNews, now = () => new Date(), logger = console } = {}) {
  let task = null;
  let tickRunning = false;
  const runRepository = repository || (pool ? new EditorialDiscoveryRunRepository(pool) : null);
  if (config.enabled && !pool) throw new TypeError('pool é obrigatório para agendar descoberta editorial.');

  async function runOne(due) {
    const { schedule, editionDate, discoveryAt, publicationAt } = due;
    const leaseSeconds = (config.maxDurationMinutes + 5) * 60;
    const lock = await runRepository.claim({
      scheduleId: schedule.id, editionDate, timezone: schedule.timezone,
      scheduledAt: discoveryAt, leaseSeconds, maxAttempts: config.maxAttempts
    });
    if (!lock) return { skipped: true, editionDate, scheduleId: schedule.id };

    return executeClaimedRun({ pool, repository: runRepository, discover, due, lock, config, now, logger });
  }

  async function tick() {
    if (!config.enabled || tickRunning) return [];
    tickRunning = true;
    try {
      const current = now();
      const due = dueSchedules({ schedules: config.schedules, now: current, leadHours: config.leadHours });
      return await Promise.all(due.map(runOne));
    } catch (error) {
      logger.error(`[EDITORIAL DISCOVERY] Falha no ciclo do scheduler: ${error.message}`);
      return [];
    } finally { tickRunning = false; }
  }

  function start() {
    if (!config.enabled) { logger.info('[EDITORIAL DISCOVERY] Scheduler desativado.'); return null; }
    if (task) return task;
    if (!cron.validate(config.pollCron)) throw new TypeError('EDITORIAL_DISCOVERY_POLL_CRON inválido.');
    task = cron.schedule(config.pollCron, () => { void tick(); }, { timezone: 'UTC' });
    void tick(); // recovery of a due window after a restart
    logger.info(`[EDITORIAL DISCOVERY] Scheduler ativo (${config.schedules.length} agenda(s), lead ${config.leadHours}h).`);
    return task;
  }

  function stop() { if (task) task.stop(); task = null; }
  return { start, stop, tick, runOne };
}

async function runEditorialDiscoveryNow({ pool, discover = discoverNews, schedule = { id: 'manual', timezone: 'UTC' },
  editionDate = localDateParts(new Date(), schedule.timezone), publishedAfter = null, publishedBefore = new Date(),
  repository = null, config = defaultConfig.loadEditorialDiscoverySchedule(), now = () => new Date(), logger = console } = {}) {
  if (!pool) throw new TypeError('pool é obrigatório para a descoberta manual.');
  const runRepository = repository || new EditorialDiscoveryRunRepository(pool);
  // Use the same persistent key as the scheduled edition so a manual run and the cron cannot overlap.
  const manualSchedule = { ...schedule, id: schedule.id || 'default' };
  const due = { schedule: manualSchedule, editionDate, discoveryAt: now(), publicationAt: null };
  const maxDurationMinutes = config.maxDurationMinutes || 30;
  const lock = await runRepository.claim({ scheduleId: manualSchedule.id, editionDate, timezone: manualSchedule.timezone,
    scheduledAt: due.discoveryAt, leaseSeconds: (maxDurationMinutes + 5) * 60, maxAttempts: config.maxAttempts || 3 });
  if (!lock) return { status: 'skipped', reason: 'manual run already claimed, completed, or out of attempts', editionDate };
  const manualConfig = { ...config, maxDurationMinutes, retryDelayMinutes: config.retryDelayMinutes || 15 };
  const result = await executeClaimedRun({ pool, repository: runRepository, discover, due, lock, config: manualConfig,
    now, logger, publishedAfter: publishedAfter || new Date(now().getTime() - 24 * 60 * 60 * 1000), publishedBefore, manual: true });
  return result;
}

module.exports = { createDiscoveryScheduler, dueSchedules, localDateParts, zonedLocalDateTimeToUtc, runEditorialDiscoveryNow };
