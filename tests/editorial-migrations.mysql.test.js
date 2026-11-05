const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { runEditorialMigrations } = require('../repositories/migrationRunner');
const { legacyNewsSql } = require('../services/editorial/legacyNewsPolicy');
const DiscoveryRepository = require('../repositories/discoveryRepository');
const EditorialDiscoveryRunRepository = require('../repositories/editorialDiscoveryRunRepository');

const enabled = process.env.EDITORIAL_MYSQL_TEST === '1';
const host = process.env.EDITORIAL_MYSQL_TEST_HOST || '127.0.0.1';

test('editorial migrations apply and rerun on a disposable local MySQL database without changing base rows', {
  skip: !enabled ? 'Set EDITORIAL_MYSQL_TEST=1 to run against a disposable loopback MySQL server.' : false
}, async () => {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host), 'Only a loopback MySQL server is allowed.');
  const port = Number(process.env.EDITORIAL_MYSQL_TEST_PORT || 33316);
  const user = process.env.EDITORIAL_MYSQL_TEST_USER || 'root';
  const password = process.env.EDITORIAL_MYSQL_TEST_PASSWORD || '';
  const dbName = `codex_editorial_test_${process.pid}_${Date.now()}`;
  assert.match(dbName, /^codex_editorial_test_[0-9]+_[0-9]+$/);

  const admin = await mysql.createConnection({ host, port, user, password, connectTimeout: 5000 });
  let pool;
  try {
    await admin.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    pool = mysql.createPool({ host, port, user, password, database: dbName, connectionLimit: 2 });

    await pool.execute(`CREATE TABLE news_sources (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, rss_url VARCHAR(500) NOT NULL UNIQUE,
      category VARCHAR(50) DEFAULT 'tecnologia', language VARCHAR(10) DEFAULT 'pt-BR',
      is_active BOOLEAN DEFAULT TRUE, collection_frequency_minutes INT DEFAULT 30,
      last_collected_at DATETIME NULL, priority INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.execute(`CREATE TABLE news_v2 (
      id INT AUTO_INCREMENT PRIMARY KEY, source_id INT NULL, title VARCHAR(500) NOT NULL,
      description TEXT NULL, original_link VARCHAR(700) NOT NULL UNIQUE, category VARCHAR(100) NULL,
      main_image VARCHAR(500) NULL, language VARCHAR(10) DEFAULT 'pt-BR', publication_date DATETIME NULL,
      status VARCHAR(50) DEFAULT 'coletada', score DECIMAL(10,2) DEFAULT 0, metadata JSON NULL,
      CONSTRAINT fk_news_v2_source FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.execute(`INSERT INTO news_sources (name, rss_url) VALUES ('Legacy RSS', 'https://rss.example/feed.xml')`);
    await pool.execute(`INSERT INTO news_sources (name, rss_url) VALUES ('Brave domain RSS', 'https://brave.example/feed.xml')`);
    await pool.execute(`INSERT INTO news_v2 (source_id, title, original_link, metadata)
      VALUES (1, 'Pre-existing RSS article', 'https://rss.example/story', JSON_OBJECT('legacy', TRUE))`);
    await pool.execute(`INSERT INTO news_v2 (source_id, title, original_link, metadata)
      VALUES (NULL, 'Brave candidate', 'https://brave.example/story', JSON_OBJECT('provider', 'brave'))`);
    const [before] = await pool.execute('SELECT id, source_id, title, original_link, metadata FROM news_v2');

    const migrations = ['001_editorial_studio', '002_editorial_discovery_scheduler'].map(version => ({
      version,
      sql: fs.readFileSync(path.join(__dirname, '..', 'migrations', `${version}.sql`), 'utf8')
    }));
    assert.deepEqual(await runEditorialMigrations(pool, migrations), ['001_editorial_studio', '002_editorial_discovery_scheduler']);

    const [tables] = await pool.execute(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name', [dbName]
    );
    assert.equal(tables.length, 13); // 2 legacy tables, 10 migration tables, plus schema_migrations

    const [indexes] = await pool.execute(
      'SELECT DISTINCT INDEX_NAME AS index_name FROM information_schema.statistics WHERE table_schema = ?', [dbName]
    );
    const indexNames = new Set(indexes.map(row => String(row.index_name).toLowerCase()));
    for (const indexName of [
      'uq_editorial_articles_news', 'uq_editorial_editions_date_timezone', 'uq_editorial_edition_article',
      'uq_editorial_edition_position', 'uq_editorial_article_version', 'uq_news_discovery_provider_url',
      'uq_newsletter_send_recipient', 'uq_editorial_discovery_schedule_date', 'idx_editorial_discovery_due'
    ]) assert.ok(indexNames.has(indexName.toLowerCase()), `Missing index ${indexName}; found ${[...indexNames].join(', ')}`);

    const [foreignKeys] = await pool.execute(
      `SELECT constraint_name FROM information_schema.key_column_usage
       WHERE table_schema = ? AND table_name <> 'news_v2' AND referenced_table_name IS NOT NULL`, [dbName]
    );
    assert.equal(foreignKeys.length, 10);

    assert.deepEqual(await runEditorialMigrations(pool, migrations), []);
    const [after] = await pool.execute('SELECT id, source_id, title, original_link, metadata FROM news_v2');
    assert.deepEqual(after, before);

    const [legacyCandidates] = await pool.execute(
      `SELECT n.id FROM news_v2 n WHERE ${legacyNewsSql('n')} ORDER BY n.id`
    );
    assert.deepEqual(legacyCandidates.map(row => Number(row.id)), [1]);

    const connection = await pool.getConnection();
    try {
      const sourceRepo = new DiscoveryRepository(pool);
      const sourceId = await sourceRepo.getOrCreateBraveSource(connection,
        { sourceDomain: 'brave.example', sourceName: 'Brave Example', category: 'hardware', language: 'en' });
      const sameSourceId = await sourceRepo.getOrCreateBraveSource(connection,
        { sourceDomain: 'brave.example', sourceName: 'Brave Example', category: 'hardware', language: 'en' });
      assert.equal(sameSourceId, sourceId);
      const [sources] = await connection.execute('SELECT name, rss_url, is_active FROM news_sources WHERE id = ?', [sourceId]);
      assert.equal(sources[0].rss_url, 'brave://brave.example');
      assert.equal(Number(sources[0].is_active), 0);
      const [rssSource] = await connection.execute('SELECT id FROM news_sources WHERE rss_url = ?', ['https://brave.example/feed.xml']);
      assert.notEqual(sourceId, Number(rssSource[0].id));

      await connection.execute(`INSERT INTO news_v2 (source_id, title, original_link, metadata)
        VALUES (?, 'Brave row with rebuilt metadata', 'https://brave.example/rebuilt-story', NULL)`, [sourceId]);
      await connection.execute(`INSERT INTO news_discovery_records
        (news_id, provider, canonical_url, source_domain, dedupe_status, discovered_at, metadata_json)
        VALUES (1, 'brave', 'https://rss.example/story', 'rss.example', 'exact_duplicate', UTC_TIMESTAMP(), JSON_OBJECT('provider', 'brave'))`);
      await connection.execute(`INSERT INTO news_discovery_records
        (news_id, provider, canonical_url, source_domain, dedupe_status, discovered_at, metadata_json)
        VALUES (3, 'brave', 'https://brave.example/rebuilt-story', 'brave.example', 'unique', UTC_TIMESTAMP(), JSON_OBJECT('provider', 'brave'))`);
      const [origins] = await connection.execute(
        `SELECT n.id FROM news_v2 n WHERE ${legacyNewsSql('n')} ORDER BY n.id`
      );
      assert.deepEqual(origins.map(row => Number(row.id)), [1],
        'An exact Brave observation does not block RSS, while a Brave row remains blocked after metadata is cleared.');
    } finally { connection.release(); }

    const runRepo = new EditorialDiscoveryRunRepository(pool);
    const runInput = { scheduleId: 'mysql-lock-test', editionDate: '2026-11-05', timezone: 'UTC',
      scheduledAt: new Date('2026-11-04T12:00:00Z'), leaseSeconds: 60, maxAttempts: 3 };
    const firstLock = await runRepo.claim(runInput);
    assert.ok(firstLock);
    assert.equal(firstLock.attempt, 1);
    assert.equal(await runRepo.claim(runInput), null, 'A second worker cannot claim an active run.');
    const leaseInput = { ...runInput, lockToken: firstLock.lockToken };
    assert.equal(await runRepo.renew(leaseInput), true);
    await pool.execute(
      `UPDATE editorial_discovery_runs SET lease_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND)
       WHERE schedule_id = ? AND edition_date = ? AND timezone = ? AND lock_token = ?`,
      [runInput.scheduleId, runInput.editionDate, runInput.timezone, firstLock.lockToken]
    );
    const recoveredLock = await runRepo.claim(runInput);
    assert.ok(recoveredLock);
    assert.equal(recoveredLock.attempt, 2);
    assert.equal(await runRepo.renew(leaseInput), false, 'The old token cannot renew after takeover.');
    assert.equal(await runRepo.complete({ ...leaseInput, status: 'completed', summary: {}, durationMs: 1 }), false);
    assert.equal(await runRepo.complete({ ...runInput, lockToken: recoveredLock.lockToken,
      status: 'completed', summary: {}, durationMs: 1 }), true);
    assert.equal(await runRepo.claim(runInput), null, 'Completed editions cannot be claimed a third time.');
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await admin.end();
  }
});
