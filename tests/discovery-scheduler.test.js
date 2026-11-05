const test = require('node:test');
const assert = require('node:assert/strict');
const { dueSchedules, zonedLocalDateTimeToUtc, createDiscoveryScheduler, runEditorialDiscoveryNow } = require('../services/discovery/discoveryScheduler');
const { loadEditorialDiscoverySchedule } = require('../config/editorialDiscoverySchedule');
const EditorialDiscoveryRunRepository = require('../repositories/editorialDiscoveryRunRepository');

const schedule = { id: 'br', timezone: 'America/Sao_Paulo', time: '08:00' };

test('calcula publicação e coleta T-24 no fuso local, inclusive em período de mudança de offset', () => {
  assert.equal(zonedLocalDateTimeToUtc('2026-11-04', '08:00', 'America/Sao_Paulo').toISOString(), '2026-11-04T11:00:00.000Z');
  assert.equal(zonedLocalDateTimeToUtc('2026-06-04', '08:00', 'America/Sao_Paulo').toISOString(), '2026-06-04T11:00:00.000Z');
  const due = dueSchedules({ schedules: [schedule], now: new Date('2026-11-03T11:00:00Z'), leadHours: 24 });
  assert.equal(due[0].editionDate, '2026-11-04');
  assert.equal(due[0].discoveryAt.toISOString(), '2026-11-03T11:00:00.000Z');
  const nextWindow = dueSchedules({ schedules: [schedule], now: new Date('2026-11-04T11:00:00Z'), leadHours: 24 });
  assert.equal(nextWindow.some(item => item.editionDate === '2026-11-04'), false);
  assert.equal(nextWindow.some(item => item.editionDate === '2026-11-05'), true);
});

test('configuração valida timezone, horários, limites e permite desativação', () => {
  const config = loadEditorialDiscoverySchedule({ EDITORIAL_DISCOVERY_ENABLED: 'true', EDITORIAL_PUBLICATION_TIMEZONE: 'America/Sao_Paulo' });
  assert.equal(config.enabled, true);
  assert.equal(config.leadHours, 24);
  assert.throws(() => loadEditorialDiscoverySchedule({ EDITORIAL_PUBLICATION_TIMEZONE: 'Mars/Olympus' }), /Fuso horário inválido/);
  assert.throws(() => loadEditorialDiscoverySchedule({ EDITORIAL_PUBLICATION_TIME: '25:00' }), /Horário de publicação inválido/);
});

test('scheduler recupera janela aberta após restart e só persiste uma vez entre instâncias', async () => {
  const rows = new Map();
  let runs = 0;
  const repository = {
    async claim({ scheduleId, editionDate }) {
      const key = `${scheduleId}:${editionDate}`;
      if (rows.has(key)) return null;
      rows.set(key, { status: 'running', lockToken: key });
      return { lockToken: key, attempt: 1 };
    },
    async complete({ scheduleId, editionDate }) { rows.set(`${scheduleId}:${editionDate}`, { status: 'completed' }); },
    async fail() { assert.fail('não esperava falha'); }
  };
  const config = { enabled: true, schedules: [schedule], leadHours: 24, maxDurationMinutes: 1, maxAttempts: 3, retryDelayMinutes: 1, pollCron: '* * * * *' };
  const dependencies = { pool: {}, config, repository, now: () => new Date('2026-11-03T12:00:00Z'),
    cron: { validate: () => true, schedule: () => ({ stop() {} }) }, logger: { info() {}, error() {} },
    discover: async () => { runs++; return { resultsFound: 1, newArticles: 1, duplicates: 0, rejected: 0, failures: 0, status: 'success' }; } };
  const instanceA = createDiscoveryScheduler(dependencies);
  const instanceB = createDiscoveryScheduler(dependencies);
  const [a, b] = await Promise.all([instanceA.tick(), instanceB.tick()]);
  assert.equal(runs, 1);
  assert.equal([...a, ...b].filter(item => item.status === 'completed').length, 1);
  assert.equal([...a, ...b].filter(item => item.skipped).length, 1);
});

test('falha Brave agenda retry controlado; timeout sinalizado e execução manual reutiliza discovery sem enviar email', async () => {
  let failures = 0;
  let seenSignal;
  const repository = {
    async claim() { return { lockToken: 'lock', attempt: 1 }; },
    async complete() { assert.fail('falha não deve completar'); },
    async fail(info) { failures++; assert.equal(info.retryDelayMinutes, 7); }
  };
  const config = { enabled: true, schedules: [schedule], leadHours: 24, maxDurationMinutes: 1, maxAttempts: 3, retryDelayMinutes: 7, pollCron: '* * * * *' };
  const scheduler = createDiscoveryScheduler({ pool: {}, config, repository,
    now: () => new Date('2026-11-03T12:00:00Z'), logger: { info() {}, error() {} },
    discover: async args => { seenSignal = args.signal; throw new Error('Brave indisponível'); } });
  const [result] = await scheduler.tick();
  assert.equal(result.status, 'failed');
  assert.equal(failures, 1);
  assert.equal(seenSignal instanceof AbortSignal, true);

  let manual;
  const summary = await runEditorialDiscoveryNow({ pool: {}, publishedAfter: '2026-11-02T00:00:00Z',
    publishedBefore: '2026-11-03T00:00:00Z', discover: async args => { manual = args; return { newArticles: 2 }; } });
  assert.equal(manual.persist, true);
  assert.equal(manual.publishedAfter, '2026-11-02T00:00:00Z');
  assert.deepEqual(summary, { newArticles: 2 });
});

test('tentativas são limitadas e uma execução lenta é abortada dentro do prazo configurado', async () => {
  let current = new Date('2026-11-03T12:00:00Z');
  let attempts = 0;
  const repo = {
    async claim() { attempts++; return attempts <= 2 ? { lockToken: `lock-${attempts}`, attempt: attempts } : null; },
    async complete() { assert.fail('execução lenta não deve completar'); },
    async fail() {}
  };
  const config = { enabled: true, schedules: [schedule], leadHours: 24, maxDurationMinutes: 0.0001, maxAttempts: 2, retryDelayMinutes: 1, pollCron: '* * * * *' };
  const scheduler = createDiscoveryScheduler({ pool: {}, config, repository: repo, now: () => current,
    logger: { info() {}, error() {} }, discover: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) });
  const [first] = await scheduler.tick();
  assert.equal(first.status, 'failed');
  current = new Date(current.getTime() + 2 * 60 * 1000);
  const [second] = await scheduler.tick();
  assert.equal(second.status, 'failed');
  assert.equal(attempts, 2);
  assert.equal((await scheduler.tick())[0].skipped, true);
  assert.equal(attempts, 3); // terceira verificação consulta a trava, mas não recebe claim
});

test('repository faz claim condicional com lease e datas SQL em UTC', async () => {
  const calls = [];
  const pool = { async execute(sql, params) {
    calls.push({ sql, params });
    if (/SELECT attempt_count/.test(sql)) return [[{ attempt_count: 2 }], []];
    return [{ affectedRows: 1 }, []];
  } };
  const repo = new EditorialDiscoveryRunRepository(pool);
  const lock = await repo.claim({ scheduleId: 'br', editionDate: '2026-11-04', timezone: 'America/Sao_Paulo',
    scheduledAt: new Date('2026-11-03T11:00:00Z'), lockToken: 'test-lock' });
  assert.equal(lock.attempt, 2);
  assert.match(calls[1].sql, /lease_expires_at <= UTC_TIMESTAMP\(\)/);
  assert.equal(calls[0].params[3], '2026-11-03 11:00:00');
});
