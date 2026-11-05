const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const NewsRepository = require('../repositories/newsRepository');
const SelectionRepository = require('../repositories/selectionRepository');
const SelectionEngine = require('../services/selection/selectionEngine');
const { isBraveDiscovered, isLegacyNews, legacyNewsSql, getNewsOriginRows } = require('../services/editorial/legacyNewsPolicy');
const { sendLegacyNewsletterEmail, sendDiagnosticEmail } = require('../services/emailSender');
const DiscoveryRepository = require('../repositories/discoveryRepository');
const EditorialDiscoveryRunRepository = require('../repositories/editorialDiscoveryRunRepository');
const { runEditorialDiscoveryNow } = require('../services/discovery/discoveryScheduler');
const { discoverNews } = require('../services/discovery/discoveryService');

const brave = { id: 20, title: 'Brave article', metadata: { provider: 'brave' }, source_name: 'Example' };
const rss = { id: 10, title: 'RSS article', metadata: null, source_name: 'RSS Example' };

test('provider policy identifies Brave records and preserves legacy RSS records', () => {
  assert.equal(isBraveDiscovered(brave), true);
  assert.equal(isBraveDiscovered({ metadata: JSON.stringify({ provider: 'brave' }) }), true);
  assert.equal(isBraveDiscovered({ metadata: null, source_rss_url: 'brave://example.com' }), true);
  assert.equal(isBraveDiscovered({ metadata: null, discovery_provider: 'brave', discovery_status: 'unique' }), true);
  assert.equal(isBraveDiscovered({ metadata: null, discovery_provider: 'brave', discovery_status: 'exact_duplicate' }), false);
  assert.equal(isLegacyNews(rss), true);
  assert.match(legacyNewsSql('n'), /JSON_EXTRACT\(n\.metadata/);
  assert.match(legacyNewsSql('n'), /news_discovery_records/);
  assert.match(legacyNewsSql('n'), /news_sources/);
});

test('legacy candidate and saved-selection repositories exclude Brave while keeping RSS', async () => {
  const calls = [];
  const pool = { async execute(sql) {
    calls.push(sql);
    if (/news_discovery_records/.test(sql)) return [[rss, brave], []];
    return [[rss, brave], []];
  } };
  const candidates = await new NewsRepository(pool).getTopNews(20);
  const selected = await new SelectionRepository(pool).getTodaySelections();
  assert.deepEqual(candidates.map(item => item.id), [10]);
  assert.deepEqual(selected.map(item => item.id), [10]);
  assert.ok(calls.every(sql => sql.includes("JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.provider'))")));
  assert.ok(calls.every(sql => sql.includes('news_discovery_records')));
});

test('manual legacy selection rejects Brave before replacing the saved edition and preserves RSS saves', async () => {
  const braveCalls = [];
  const bravePool = { async execute(sql) {
    braveCalls.push(sql);
    if (/FROM news_v2 n LEFT JOIN news_sources/.test(sql)) return [[brave], []];
    return [{ affectedRows: 1 }, []];
  } };
  await assert.rejects(new SelectionRepository(bravePool).saveSelections([brave], 'manual'),
    error => error.code === 'UNAPPROVED_EDITORIAL_CONTENT');
  assert.equal(braveCalls.length, 1);
  assert.doesNotMatch(braveCalls[0], /DELETE FROM edition_selections/);

  const rssCalls = [];
  const rssPool = { async execute(sql) {
    rssCalls.push(sql);
    if (/FROM news_v2 n LEFT JOIN news_sources/.test(sql)) return [[rss], []];
    return [{ affectedRows: 1 }, []];
  } };
  assert.equal(await new SelectionRepository(rssPool).saveSelections([rss], 'manual'), true);
  assert.ok(rssCalls.some(sql => /DELETE FROM edition_selections/.test(sql)));
  assert.ok(rssCalls.some(sql => /INSERT INTO edition_selections/.test(sql)));
});

test('SelectionEngine filters an injected Brave candidate, preserving RSS selection', async () => {
  const engine = new SelectionEngine({});
  engine.newsRepo = { async getTopNews() { return [brave, rss]; } };
  engine.newsletterHistoryRepo = { async getPreviousEditionNewsIds() { return new Set(); } };
  const result = await engine.runDailySelection(true);
  assert.deepEqual(result.map(item => item.id), [10]);
});

test('Resend boundary blocks Brave without calling transport and still delivers a legacy welcome/newsletter item', async () => {
  const calls = [];
  const pool = { async execute(sql, ids) {
    calls.push(ids);
    return [[...ids].includes(20) ? [brave] : [rss], []];
  } };
  let transports = 0;
  const send = async () => { transports++; return { success: true, id: 'mock-message' }; };
  await assert.rejects(sendLegacyNewsletterEmail({ pool, newsItems: [brave], to: 'reader@example.test',
    subject: 'Newsletter', html: '<p>x</p>', send }), error => error.code === 'UNAPPROVED_EDITORIAL_CONTENT');
  assert.equal(transports, 0);
  const welcome = await sendLegacyNewsletterEmail({ pool, newsItems: [rss], to: 'reader@example.test',
    subject: 'Welcome', html: '<p>Welcome</p>', send });
  assert.equal(welcome.success, true);
  assert.equal(transports, 1);
});

test('Resend boundary fails closed when an item ID is missing from the database', async () => {
  let transports = 0;
  const pool = { async execute() { return [[], []]; } };
  await assert.rejects(sendLegacyNewsletterEmail({ pool, newsItems: [rss], to: 'reader@example.test',
    subject: 'Newsletter', html: '<p>x</p>', send: async () => { transports++; } }), /nem todas as notícias puderam ser verificadas/);
  assert.equal(transports, 0);
});

test('origin lookup falls back to the legacy schema when editorial migrations are absent', async () => {
  const calls = [];
  const pool = { async execute(sql, ids) {
    calls.push(sql);
    if (/news_discovery_records/.test(sql)) {
      throw Object.assign(new Error("Table 'db.news_discovery_records' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
    }
    return [[{ ...rss, source_rss_url: 'https://rss.example/feed.xml' }], []];
  } };
  const rows = await getNewsOriginRows(pool, [rss.id]);
  assert.equal(rows.length, 1);
  assert.equal(isLegacyNews(rows[0]), true);
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1], /news_discovery_records/);
});

test('low-level Resend transport is private and diagnostics require an explicit non-production environment', async () => {
  assert.equal(require('../services/emailSender').sendEmail, undefined);
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDiagnostic = process.env.ALLOW_RESEND_DIAGNOSTIC;
  process.env.NODE_ENV = 'production';
  process.env.ALLOW_RESEND_DIAGNOSTIC = '1';
  try {
    await assert.rejects(sendDiagnosticEmail({ to: 'diagnostic@example.test' }), /bloqueado/);
    delete process.env.NODE_ENV;
    await assert.rejects(sendDiagnosticEmail({ to: 'diagnostic@example.test' }), /bloqueado/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDiagnostic === undefined) delete process.env.ALLOW_RESEND_DIAGNOSTIC;
    else process.env.ALLOW_RESEND_DIAGNOSTIC = previousDiagnostic;
  }
});

test('server routes use the guarded sender for daily and welcome messages', () => {
  const server = fs.readFileSync(require.resolve('../server'), 'utf8');
  assert.match(server, /const \{ sendLegacyNewsletterEmail \} = require\('\.\/services\/emailSender'\)/);
  assert.equal((server.match(/sendLegacyNewsletterEmail\(/g) || []).length, 2);
  assert.doesNotMatch(server, /\bsendEmail\(/);
  assert.match(server, /cron\.schedule\('0 8 \* \* \*'/);
  assert.match(server, /app\.get\('\/trigger-email'/);
  assert.match(server, /sendWelcomeNewsletter\(email, userTopic\)/);

  const sender = fs.readFileSync(require.resolve('../services/emailSender'), 'utf8');
  assert.doesNotMatch(sender, /module\.exports\s*=\s*\{[^}]*sendEmail/);
  const rootDiagnostic = fs.readFileSync(require.resolve('../test-resend.js'), 'utf8');
  assert.match(rootDiagnostic, /sendDiagnosticEmail/);
  assert.doesNotMatch(rootDiagnostic, /\bsendEmail\(|emails\.send/);

  const nestedLegacyServer = fs.readFileSync(require.resolve('../Tech-e-Development-Newsletter-main/server.js'), 'utf8');
  assert.equal((nestedLegacyServer.match(/assertLegacyNewsletterItems\(newsBR\)/g) || []).length, 2);
  assert.match(nestedLegacyServer, /require\('\.\.\/services\/emailSender'\)/);
  assert.equal((nestedLegacyServer.match(/sendLegacyNewsletterEmail\(/g) || []).length, 2);
  assert.doesNotMatch(nestedLegacyServer, /return Sender\.net\.emails\.send\(|const sendResult = await Sender\.net\.emails\.send\(/);
  assert.doesNotMatch(nestedLegacyServer, /fetchFromBraveSearch\(q,/);
  const nestedDiagnostic = fs.readFileSync(require.resolve('../Tech-e-Development-Newsletter-main/test-resend.js'), 'utf8');
  assert.match(nestedDiagnostic, /sendDiagnosticEmail/);
  assert.doesNotMatch(nestedDiagnostic, /new Resend|emails\.send/);

  const cli = fs.readFileSync(require.resolve('../scripts/discover-brave.js'), 'utf8');
  assert.match(cli, /runEditorialDiscoveryNow/);
  assert.doesNotMatch(cli, /discoverNews\(\{ pool, queries, persist \}\)/);
});

test('source catalog keeps Brave origin distinct from an existing RSS feed and reuses its dedicated host entry', async () => {
  const sources = [{ id: 7, rss_url: 'https://example.com/feed.xml', is_active: true }];
  const calls = [];
  const connection = {
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT id FROM news_sources WHERE rss_url/.test(sql)) {
        const found = sources.find(source => source.rss_url === params[0]);
        return [[...(found ? [{ id: found.id }] : [])], []];
      }
      if (/INSERT IGNORE INTO news_sources/.test(sql)) {
        sources.push({ id: 8, rss_url: params[1], is_active: false });
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }
  };
  const repo = new DiscoveryRepository({});
  const braveSourceId = await repo.getOrCreateBraveSource(connection,
    { sourceDomain: 'example.com', sourceName: 'Example', category: 'hardware' });
  const sameBraveSourceId = await repo.getOrCreateBraveSource(connection,
    { sourceDomain: 'example.com', sourceName: 'Example', category: 'hardware' });
  assert.equal(braveSourceId, 8);
  assert.equal(sameBraveSourceId, 8);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].rss_url, 'https://example.com/feed.xml');
  assert.equal(sources[1].rss_url, 'brave://example.com');
  assert.equal(sources[1].is_active, false);
  const insert = calls.find(call => /INSERT IGNORE INTO news_sources/.test(call.sql));
  assert.match(insert.sql, /is_active, priority\)\s+VALUES \(\?, \?, \?, \?, FALSE, 0\)/);
  assert.deepEqual(insert.params, ['Example', 'brave://example.com', 'hardware', 'pt-BR']);
});

test('lost-lease fencing rejects an article transaction before source or news writes', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {}, async rollback() { calls.push('rollback'); }, async commit() { calls.push('commit'); }, release() {},
    async execute(sql) {
      calls.push(sql);
      if (/SELECT 1 AS owns_lease/.test(sql)) return [[], []];
      return [{ affectedRows: 1, insertId: 1 }, []];
    }
  };
  const repo = new DiscoveryRepository({ getConnection: async () => connection });
  await assert.rejects(repo.persistDiscovered({ sourceDomain: 'example.com' }, undefined, {
    lease: { scheduleId: 'br', editionDate: '2026-11-05', timezone: 'UTC', lockToken: 'stale' }
  }), error => error.code === 'DISCOVERY_LEASE_LOST');
  assert.equal(calls.some(sql => typeof sql === 'string' && /INSERT INTO news_v2|INSERT IGNORE INTO news_sources/.test(sql)), false);
  assert.ok(calls.includes('rollback'));
});

test('article transaction rolls back when its lease expires before commit', async () => {
  let leaseChecks = 0;
  let articleWrites = 0;
  const calls = [];
  const connection = {
    async beginTransaction() {},
    async rollback() { calls.push('rollback'); },
    async commit() { calls.push('commit'); },
    release() {},
    async execute(sql) {
      if (/SELECT 1 AS owns_lease/.test(sql)) {
        leaseChecks++;
        return [leaseChecks === 1 ? [{ owns_lease: 1 }] : [], []];
      }
      if (/SELECT dr\.news_id/.test(sql)) return [[], []];
      if (/SELECT id FROM news_sources/.test(sql)) return [[{ id: 44 }], []];
      if (/INSERT INTO news_v2/.test(sql)) { articleWrites++; return [{ insertId: 90 }, []]; }
      if (/INSERT IGNORE INTO news_discovery_records/.test(sql)) return [{ affectedRows: 1 }, []];
      return [{ affectedRows: 1 }, []];
    }
  };
  const repo = new DiscoveryRepository({ getConnection: async () => connection });
  await assert.rejects(repo.persistDiscovered({ sourceDomain: 'example.com', sourceName: 'Example',
    canonicalUrl: 'https://example.com/story', originalUrl: 'https://example.com/story',
    title: 'Story', metadata: { provider: 'brave' } }, undefined, {
    lease: { scheduleId: 'br', editionDate: '2026-11-05', timezone: 'UTC', lockToken: 'expired-during-write' }
  }), error => error.code === 'DISCOVERY_LEASE_LOST');
  assert.equal(leaseChecks, 2);
  assert.equal(articleWrites, 1);
  assert.ok(calls.includes('rollback'));
  assert.equal(calls.includes('commit'), false);
});

test('rediscovery repairs only a Brave row with a missing source_id', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {}, async rollback() {}, async commit() {}, release() {},
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT 1 AS owns_lease/.test(sql)) return [[{ owns_lease: 1 }], []];
      if (/FROM news_discovery_records dr/.test(sql)) return [[{
        news_id: 90, source_id: null, metadata: { provider: 'brave' }, canonical_url: 'https://example.com/story', source_domain: 'example.com'
      }], []];
      if (/FROM news_sources/.test(sql)) return [[{ id: 44 }], []];
      if (/INSERT IGNORE INTO news_discovery_records/.test(sql)) return [{ affectedRows: 0 }, []];
      if (/SELECT news_id FROM news_discovery_records/.test(sql)) return [[{ news_id: 90 }], []];
      return [{ affectedRows: 1 }, []];
    }
  };
  const repo = new DiscoveryRepository({ getConnection: async () => connection });
  const result = await repo.persistDiscovered({
    sourceDomain: 'example.com', sourceName: 'Example', canonicalUrl: 'https://example.com/story', metadata: { provider: 'brave' }
  }, undefined, { lease: { scheduleId: 'br', editionDate: '2026-11-05', timezone: 'UTC', lockToken: 'current' } });
  assert.equal(result.status, 'exact_duplicate');
  const backfill = calls.find(call => /UPDATE news_v2 SET source_id/.test(call.sql));
  assert.deepEqual(backfill.params, [44, 90, null]);
  assert.equal(calls.some(call => /INSERT INTO news_v2/.test(call.sql)), false);
});

test('editorial persistence fails closed without a scheduler or manual lease', async () => {
  let externalCalls = 0;
  await assert.rejects(discoverNews({ pool: {}, persist: true, queries: [{ id: 'test', q: 'test' }],
    brave: { async search() { externalCalls++; return []; } } }),
  error => error.code === 'DISCOVERY_LEASE_REQUIRED');
  const repo = new DiscoveryRepository({ getConnection: async () => { throw new Error('connection must not be opened'); } });
  await assert.rejects(repo.persistDiscovered({ sourceDomain: 'example.com' }),
    error => error.code === 'DISCOVERY_LEASE_REQUIRED');
  assert.equal(externalCalls, 0);
});

test('discovery stops before another article or log write after lease loss', async () => {
  let persistenceAttempts = 0;
  let completedLogs = 0;
  const error = Object.assign(new Error('lease lost'), { code: 'DISCOVERY_LEASE_LOST' });
  await assert.rejects(discoverNews({ pool: {}, persist: true, persistenceLease: {
    scheduleId: 'br', editionDate: '2026-11-05', timezone: 'UTC', lockToken: 'old-token'
  }, queries: [{ id: 'software', q: 'software' }], publishedAfter: '2026-11-04T00:00:00Z',
  publishedBefore: '2026-11-06T00:00:00Z',
  brave: { async search() { return [
    { title: 'First story', url: 'https://first.example/story', page_age: '2026-11-05T10:00:00Z' },
    { title: 'Second story', url: 'https://second.example/story', page_age: '2026-11-05T11:00:00Z' }
  ]; } },
  discoveryRepository: {
    async findCanonical() { return null; },
    async findTitleCandidates() { return []; },
    async persistDiscovered() { persistenceAttempts++; throw error; }
  },
  discoveryLogRepository: { async create() { return 1; }, async complete() { completedLogs++; } }
  }), current => current.code === 'DISCOVERY_LEASE_LOST');
  assert.equal(persistenceAttempts, 1);
  assert.equal(completedLogs, 0);
});

test('lease heartbeat is conditional on current token and an unexpired lease', async () => {
  let call;
  const repo = new EditorialDiscoveryRunRepository({ async execute(sql, params) {
    call = { sql, params };
    return [{ affectedRows: 0 }, []];
  } });
  const renewed = await repo.renew({ scheduleId: 'br', editionDate: '2026-11-05', timezone: 'UTC', lockToken: 'stale' });
  assert.equal(renewed, false);
  assert.match(call.sql, /lease_expires_at > UTC_TIMESTAMP\(\)/);
  assert.match(call.sql, /lock_token = \?/);
});

test('a long-running manual discovery renews its lease before completion', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const renewals = [];
    let finishDiscovery;
    const repository = {
      async claim() { return { lockToken: 'manual-long', attempt: 1 }; },
      async renew(input) { renewals.push(input); return true; },
      async complete() { return true; },
      async fail() { return true; }
    };
    const run = runEditorialDiscoveryNow({ pool: {}, repository, schedule: { id: 'br', timezone: 'UTC' },
      editionDate: '2026-11-05', now: () => new Date('2026-11-05T12:00:00Z'),
      config: { maxDurationMinutes: 3, maxAttempts: 2, retryDelayMinutes: 1 }, logger: { info() {}, error() {} },
      discover: () => new Promise(resolve => { finishDiscovery = resolve; }) });

    await Promise.resolve();
    await Promise.resolve();
    t.mock.timers.tick(160_000);
    await Promise.resolve();
    assert.equal(renewals.length, 1);
    assert.equal(renewals[0].lockToken, 'manual-long');

    finishDiscovery({ failures: 0, newArticles: 1, status: 'success' });
    assert.equal((await run).status, 'completed');
  } finally {
    t.mock.timers.reset();
  }
});

test('manual runs share a persistent claim and do not duplicate a completed same-day run', async () => {
  const claimed = new Set();
  const claimedScheduleIds = [];
  let discovers = 0;
  const repository = {
    async claim(input) {
      claimedScheduleIds.push(input.scheduleId);
      const key = `${input.scheduleId}:${input.editionDate}`;
      if (claimed.has(key)) return null;
      claimed.add(key);
      return { lockToken: key, attempt: 1 };
    },
    async renew() { return true; },
    async complete() { return true; },
    async fail() { return true; }
  };
  const args = { pool: {}, repository, schedule: { id: 'br', timezone: 'America/Sao_Paulo' },
    editionDate: '2026-11-05', now: () => new Date('2026-11-04T12:00:00Z'),
    config: { enabled: false, maxDurationMinutes: 1, maxAttempts: 3, retryDelayMinutes: 1 },
    logger: { info() {}, error() {} }, discover: async () => { discovers++; return { failures: 0, newArticles: 1, status: 'success' }; } };
  const first = await runEditorialDiscoveryNow(args);
  const second = await runEditorialDiscoveryNow(args);
  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'skipped');
  assert.equal(discovers, 1);
  assert.deepEqual(claimedScheduleIds, ['br', 'br']);
});
