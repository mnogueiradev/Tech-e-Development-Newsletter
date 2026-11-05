const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMigration,
  runEditorialMigrations
} = require('../repositories/migrationRunner');
const EditorialArticleRepository = require('../repositories/editorialArticleRepository');
const EditorialEditionRepository = require('../repositories/editorialEditionRepository');
const EditorialAssetRepository = require('../repositories/editorialAssetRepository');
const EditorialAuditRepository = require('../repositories/editorialAuditRepository');
const DiscoveryLogRepository = require('../repositories/discoveryLogRepository');
const DiscoveryRecordRepository = require('../repositories/discoveryRecordRepository');

class MigrationPool {
  constructor() { this.applied = new Map(); this.statements = []; this.failAt = null; }
  async execute(sql, params = []) {
    this.statements.push({ sql, params });
    if (/SELECT checksum FROM schema_migrations/.test(sql)) {
      const row = this.applied.has(params[0]) ? [{ checksum: this.applied.get(params[0]) }] : [];
      return [row];
    }
    if (/INSERT INTO schema_migrations/.test(sql)) {
      this.applied.set(params[0], params[1]);
      return [{ affectedRows: 1 }];
    }
    if (this.failAt && this.statements.length === this.failAt) throw new Error('simulated DDL failure');
    return [{ affectedRows: 1, insertId: this.statements.length }];
  }
}

test('splitter treats statements in migration as discrete DDL', () => {
  assert.deepEqual(parseMigration('-- note\nCREATE TABLE a (id INT);\nCREATE TABLE b (id INT);'), [
    '-- note\nCREATE TABLE a (id INT)', 'CREATE TABLE b (id INT)'
  ]);
});

test('migration applies once and unchanged reruns do not replay DDL', async () => {
  const pool = new MigrationPool();
  const migration = { version: '001_test', sql: 'CREATE TABLE IF NOT EXISTS a (id INT);\nCREATE TABLE IF NOT EXISTS b (id INT);' };
  assert.deepEqual(await runEditorialMigrations(pool, [migration]), ['001_test']);
  const countAfterApply = pool.statements.length;
  assert.deepEqual(await runEditorialMigrations(pool, [migration]), []);
  assert.equal(pool.statements.length, countAfterApply + 2); // journal create + checksum read
  assert.equal(pool.applied.size, 1);
});

test('migration rejects checksum drift and leaves failed migration unrecorded', async () => {
  const pool = new MigrationPool();
  const original = { version: '001_test', sql: 'CREATE TABLE IF NOT EXISTS a (id INT);' };
  await runEditorialMigrations(pool, [original]);
  await assert.rejects(runEditorialMigrations(pool, [{ ...original, sql: 'CREATE TABLE IF NOT EXISTS b (id INT);' }]), /checksum diferente/);

  const failingPool = new MigrationPool();
  failingPool.failAt = 3;
  await assert.rejects(runEditorialMigrations(failingPool, [original]), /parcialmente aplicado/);
  assert.equal(failingPool.applied.size, 0);
});

test('migration is additive and defines expected editorial relationships and uniqueness', () => {
  const fs = require('node:fs');
  const sql = fs.readFileSync(require.resolve('../migrations/001_editorial_studio.sql'), 'utf8');
  assert.match(sql, /REFERENCES news_v2\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /UNIQUE KEY uq_editorial_edition_article \(edition_id, article_id\)/);
  assert.match(sql, /UNIQUE KEY uq_editorial_edition_position \(edition_id, position\)/);
  assert.match(sql, /content_json JSON/);
  assert.match(sql, /rendered_html LONGTEXT/);
  assert.match(sql, /UNIQUE KEY uq_newsletter_send_recipient \(edition_id, recipient_email\)/);
  assert.match(sql, /UNIQUE KEY uq_news_discovery_provider_url \(provider, canonical_url\)/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)\b/i);
});

test('repositories persist JSON, associations, assets, discovery and audit records', async () => {
  const calls = [];
  const pool = { execute: async (sql, params) => { calls.push({ sql, params }); return [{ insertId: calls.length, affectedRows: 1 }]; } };
  const articleRepo = new EditorialArticleRepository(pool);
  const articleId = await articleRepo.create({ newsId: 41, contentJson: { type: 'doc', content: [] }, createdBy: 'admin' });
  assert.equal(articleId, 1);
  assert.equal(calls[0].params[4], JSON.stringify({ type: 'doc', content: [] }));

  await articleRepo.updateContent({ id: articleId, headline: 'H', subtitle: 'S', tldr: 'T', contentJson: { type: 'doc' }, renderedHtml: '<p>x</p>' });
  await articleRepo.saveVersion({ articleId, version: 2, snapshot: { headline: 'H' }, changedBy: 'admin' });
  await articleRepo.listVersions(articleId);
  const editionRepo = new EditorialEditionRepository(pool);
  const editionId = await editionRepo.create({ editionDate: '2026-11-04', title: 'Edição' });
  await editionRepo.addArticle({ editionId, articleId, position: 1, isFeatured: true });
  await editionRepo.listArticles(editionId);
  await new EditorialAssetRepository(pool).create({ publicUrl: 'https://cdn.example/a.gif', mimeType: 'image/gif', assetType: 'gif' });
  await new EditorialAuditRepository(pool).record({ action: 'article.updated', entityType: 'article', entityId: articleId, details: { v: 2 } });
  await new DiscoveryLogRepository(pool).create({ provider: 'brave', queryText: 'security', startedAt: new Date(), metadata: { count: 5 } });
  await new DiscoveryRecordRepository(pool).create({ newsId: 41, provider: 'brave', canonicalUrl: 'https://example.com/a', sourceDomain: 'example.com', discoveredAt: new Date() });

  assert.ok(calls.some(call => /ORDER BY ea\.position ASC/.test(call.sql)));
  assert.ok(calls.some(call => /INSERT INTO editorial_assets/.test(call.sql)));
  assert.ok(calls.some(call => /INSERT INTO editorial_audit_logs/.test(call.sql)));
  assert.ok(calls.some(call => /INSERT INTO news_discovery_logs/.test(call.sql)));
  assert.ok(calls.some(call => /INSERT INTO news_discovery_records/.test(call.sql)));
});
