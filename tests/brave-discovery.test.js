const test = require('node:test');
const assert = require('node:assert/strict');
const { BraveNewsService, BraveApiError, API_URL, getFreshness } = require('../services/discovery/braveNewsService');
const { normalizeUrl, normalizeNewsResult, isWithinPublicationWindow } = require('../services/discovery/newsNormalizer');
const { titleSimilarity, detectDuplicate } = require('../services/discovery/newsDeduplicator');
const { discoverNews } = require('../services/discovery/discoveryService');
const DiscoveryRepository = require('../repositories/discoveryRepository');

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] || null },
    clone() { return this; },
    async json() { return body; }
  };
}

test('Brave request uses News Search, authentication, filters and pagination', async () => {
  const calls = [];
  const brave = new BraveNewsService({ apiKey: 'test-secret', fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return response(200, { results: [{ title: 'a' }, { title: 'b' }] });
  } });
  const results = await brave.search({ id: 'ai', q: 'AI technology', category: 'ia', searchLang: 'en', country: 'BR' }, {
    publishedAfter: '2026-11-01', publishedBefore: '2026-11-03', count: 2, maxPages: 2
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.origin + calls[0].url.pathname, API_URL);
  assert.equal(calls[0].url.searchParams.get('freshness'), '2026-11-01to2026-11-03');
  assert.equal(calls[1].url.searchParams.get('offset'), '1');
  assert.equal(calls[0].options.headers['X-Subscription-Token'], 'test-secret');
  assert.equal(results.length, 4);
});

test('freshness handles default, custom and reversed dates', () => {
  assert.equal(getFreshness(), 'pd');
  assert.equal(getFreshness({ publishedAfter: '2026-11-01', publishedBefore: '2026-11-03' }), '2026-11-01to2026-11-03');
  assert.throws(() => getFreshness({ publishedAfter: '2026-11-04', publishedBefore: '2026-11-03' }), /anterior ou igual/);
});

test('API key absence, permanent HTTP errors, 429 retry-after and invalid response are handled', async () => {
  await assert.rejects(new BraveNewsService({ apiKey: '' }).search({ q: 'test' }), error => error.code === 'MISSING_API_KEY');
  const permanent = new BraveNewsService({ apiKey: 'x', maxRetries: 0, fetchImpl: async () => response(401, {}) });
  await assert.rejects(permanent.search({ q: 'test' }), error => error.status === 401 && !error.retryable);
  let calls = 0;
  const delays = [];
  const limited = new BraveNewsService({ apiKey: 'x', maxRetries: 1, sleep: async ms => delays.push(ms), fetchImpl: async () => {
    calls++;
    return calls === 1 ? response(429, { error: { code: 'RATE_LIMITED' } }, { 'retry-after': '0' }) : response(200, { results: [] });
  } });
  assert.deepEqual(await limited.search({ q: 'test' }), []);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [0]);
  const invalid = new BraveNewsService({ apiKey: 'x', fetchImpl: async () => response(200, {}) });
  await assert.rejects(invalid.search({ q: 'test' }), error => error.code === 'INVALID_RESPONSE');
});

test('network timeout is bounded and surfaced without exposing API key', async () => {
  const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const brave = new BraveNewsService({ apiKey: 'secret', maxRetries: 0, timeoutMs: 5, fetchImpl: async () => { throw timeout; } });
  await assert.rejects(brave.search({ q: 'test' }), error => error.code === 'TIMEOUT' && !error.message.includes('secret'));
});

test('URL and article normalization preserve originals and optional fields safely', () => {
  assert.equal(normalizeUrl('http://www.example.com/story/?utm_source=x&ref=mail&id=7#top'), 'https://example.com/story?id=7&ref=mail');
  const query = { id: 'hardware', category: 'hardware', searchLang: 'en' };
  const item = normalizeNewsResult({
    title: 'Chip launch', url: 'https://www.example.com/story?utm_campaign=x',
    profile: { name: 'Example Tech' }, thumbnail: { src: 'https://cdn.example/image.jpg' }, page_age: '2026-11-02T12:00:00Z'
  }, query, new Date('2026-11-03T00:00:00Z'));
  assert.equal(item.title, 'Chip launch');
  assert.equal(item.sourceName, 'Example Tech');
  assert.equal(item.sourceDomain, 'example.com');
  assert.equal(item.imageUrl, 'https://cdn.example/image.jpg');
  assert.equal(item.description, null);
  assert.equal(item.publishedAt.toISOString(), '2026-11-02T12:00:00.000Z');
  assert.equal(item.metadata.pageFetched, null);
  assert.equal(normalizeNewsResult({ title: 'missing url' }, query), null);
});

test('title duplicate detection only suspects similar titles on same domain', () => {
  assert.ok(titleSimilarity('Nvidia lança novo chip de inteligência artificial', 'Nvidia lança novo chip de inteligência artificial hoje') > 0.8);
  const item = { title: 'Nvidia lança novo chip de inteligência artificial', canonicalUrl: 'https://example.com/a', sourceDomain: 'example.com' };
  assert.equal(detectDuplicate(item, [{ news_id: 9, title: item.title, canonical_url: 'https://example.com/a', source_domain: 'example.com' }]).kind, 'exact');
  assert.equal(detectDuplicate(item, [{ news_id: 9, title: item.title, canonical_url: 'https://example.com/b', source_domain: 'example.com' }]).kind, 'possible');
  assert.equal(detectDuplicate(item, [{ news_id: 9, title: item.title, canonical_url: 'https://elsewhere.com/b', source_domain: 'elsewhere.com' }]).kind, 'none');
});

test('discovery persists new and possible duplicates, rejects stale/invalid results, logs partial failures', async () => {
  const results = [
    { title: 'New software story', url: 'https://new.example/a', description: 'new', page_age: '2026-11-03T10:00:00Z' },
    { title: 'Nvidia launches new AI chip platform today', url: 'https://hardware.example/new', page_age: '2026-11-03T10:00:00Z' },
    { title: 'Old story', url: 'https://old.example/a', page_age: '2026-10-01T10:00:00Z' },
    { title: 'Missing link' }
  ];
  const persisted = [];
  const logs = [];
  const discoveryRepository = {
    async findCanonical() { return null; },
    async findTitleCandidates(domain) { return domain === 'hardware.example' ? [{ news_id: 33, title: 'Nvidia launches new AI chip platform', source_domain: domain }] : []; },
    async persistDiscovered(item, duplicate) {
      persisted.push({ item, duplicate });
      return { newsId: 40 + persisted.length, status: duplicate.kind === 'possible' ? 'possible_duplicate' : 'unique', insertedRecord: true, insertedArticle: true };
    }
  };
  const discoveryLogRepository = {
    async create(entry) { logs.push({ entry }); return logs.length; },
    async complete(id, entry) { logs[id - 1].complete = entry; }
  };
  const summary = await discoverNews({
    pool: {}, persist: true, queries: [{ id: 'software', q: 'software', category: 'dev' }, { id: 'broken', q: 'broken' }],
    publishedAfter: '2026-11-02T00:00:00Z', publishedBefore: '2026-11-04T00:00:00Z',
    now: () => new Date('2026-11-03T12:00:00Z'), discoveryRepository, discoveryLogRepository,
    brave: { async search(query) { if (query.id === 'broken') throw new BraveApiError('rate limited', { status: 429, retryable: true }); return results; } }
  });
  assert.equal(summary.resultsFound, 4);
  assert.equal(summary.newArticles, 2);
  assert.equal(summary.rejected, 2);
  assert.equal(summary.failures, 1);
  assert.equal(summary.status, 'partial');
  assert.equal(persisted.length, 2);
  assert.equal(persisted[1].duplicate.kind, 'possible'); // retained for review, not discarded
  assert.equal(logs[0].complete.rejectedCount, 2);
  assert.equal(logs[1].complete.status, 'failed');
});

test('repeat persistence reuses existing news without overwriting its original data', async () => {
  const news = [];
  const records = [];
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql, params = []) {
      if (/SELECT dr\.news_id/.test(sql)) {
        const found = records.find(record => record.canonicalUrl === params[0]);
        return [[found ? { news_id: found.newsId, title: news.find(row => row.id === found.newsId).title, canonical_url: found.canonicalUrl, source_domain: found.domain } : undefined].filter(Boolean), []];
      }
      if (/INSERT INTO news_v2/.test(sql)) {
        const id = news.length + 1;
        news.push({ id, title: params[0], original_link: params[2] });
        return [{ insertId: id }];
      }
      if (/INSERT IGNORE INTO news_discovery_records/.test(sql)) {
        const [, canonicalUrl, domain, status, duplicateOf, discoveredAt] = params;
        if (records.some(record => record.canonicalUrl === canonicalUrl)) return [{ affectedRows: 0 }];
        const row = { newsId: params[0], canonicalUrl, domain, status, duplicateOf, discoveredAt };
        records.push(row);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
  };
  const repo = new DiscoveryRepository({ getConnection: async () => connection });
  const item = {
    title: 'Original headline', description: 'Original description', originalUrl: 'https://example.com/story?utm_source=x',
    canonicalUrl: 'https://example.com/story', sourceDomain: 'example.com', category: 'tech', language: 'en',
    imageUrl: null, publishedAt: new Date('2026-11-03T00:00:00Z'), discoveredAt: new Date(), metadata: {}
  };
  const first = await repo.persistDiscovered(item);
  const second = await repo.persistDiscovered({ ...item, title: 'Changed title from later response' });
  assert.equal(first.status, 'unique');
  assert.equal(first.insertedArticle, true);
  assert.equal(second.status, 'exact_duplicate');
  assert.equal(second.insertedArticle, false);
  assert.equal(news.length, 1);
  assert.equal(news[0].title, 'Original headline');
});

test('an old discovery timestamp does not make a stale article recent', () => {
  const item = { publishedAt: new Date('2026-10-01T00:00:00Z'), discoveredAt: new Date('2026-11-03T00:00:00Z') };
  assert.equal(isWithinPublicationWindow(item, '2026-11-02T00:00:00Z', '2026-11-04T00:00:00Z'), false);
  assert.equal(isWithinPublicationWindow({ publishedAt: null }, '2026-11-02T00:00:00Z', '2026-11-04T00:00:00Z'), false);
});
