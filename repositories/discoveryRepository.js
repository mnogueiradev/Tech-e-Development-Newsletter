const { isBraveDiscovered } = require('../services/editorial/legacyNewsPolicy');

class DiscoveryRepository {
  constructor(pool) { this.pool = pool; }

  async getOrCreateBraveSource(connection, item) {
    const domain = String(item.sourceDomain || '').toLowerCase();
    if (!/^(?=.{1,253}$)[a-z0-9.-]+$/.test(domain) || domain.startsWith('.') || domain.endsWith('.')) {
      throw new TypeError('Domínio de fonte Brave inválido.');
    }
    const rssUrl = `brave://${domain}`;
    const [matches] = await connection.execute(
      'SELECT id FROM news_sources WHERE rss_url = ? LIMIT 1', [rssUrl]
    );
    if (matches[0]) {
      return Number(matches[0].id);
    }

    // A dedicated inactive source id preserves Brave origin even if article metadata is rebuilt.
    // It is unique per publisher host and never overlaps the active RSS feed for that host.
    await connection.execute(
      `INSERT IGNORE INTO news_sources (name, rss_url, category, language, is_active, priority)
       VALUES (?, ?, ?, ?, FALSE, 0)`,
      [String(item.sourceName || domain).slice(0, 100), rssUrl, item.category || 'tecnologia', item.language || 'pt-BR']
    );
    const [created] = await connection.execute('SELECT id FROM news_sources WHERE rss_url = ? LIMIT 1', [rssUrl]);
    if (!created[0]) throw new Error(`Não foi possível registrar a fonte Brave ${domain}.`);
    return Number(created[0].id);
  }

  async assertLease(connection, lease, signal) {
    if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
    if (!lease) return;
    const [rows] = await connection.execute(
      `SELECT 1 AS owns_lease FROM editorial_discovery_runs
       WHERE schedule_id = ? AND edition_date = ? AND timezone = ? AND lock_token = ?
         AND status = 'running' AND lease_expires_at > UTC_TIMESTAMP()
       LIMIT 1 FOR UPDATE`,
      [lease.scheduleId, lease.editionDate, lease.timezone, lease.lockToken]
    );
    if (!rows.length) {
      const error = new Error('A execução perdeu a posse do lease editorial.');
      error.code = 'DISCOVERY_LEASE_LOST';
      throw error;
    }
    if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
  }

  async backfillBraveSourceId(connection, article, newsId, item, signal) {
    if (!article || !isBraveDiscovered(article) || /^brave:\/\//i.test(String(article.source_rss_url || ''))) return;
    const sourceId = await this.getOrCreateBraveSource(connection, item);
    if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
    await connection.execute('UPDATE news_v2 SET source_id = ? WHERE id = ? AND source_id <=> ?',
      [sourceId, newsId, article.source_id ?? null]);
  }

  async findCanonical(canonicalUrl) {
    const [rows] = await this.pool.execute(
      `SELECT dr.news_id, n.title, dr.canonical_url, dr.source_domain
       FROM news_discovery_records dr JOIN news_v2 n ON n.id = dr.news_id
       WHERE dr.canonical_url = ? LIMIT 1`, [canonicalUrl]
    );
    return rows[0] || null;
  }

  async findTitleCandidates(domain, limit = 100) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const [rows] = await this.pool.execute(
      `SELECT n.id AS news_id, n.title, n.original_link, ? AS source_domain
       FROM news_v2 n
       WHERE LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(n.original_link, '://www.', '://'), '/', 3), '://', -1)) = ?
       ORDER BY n.publication_date DESC LIMIT ${safeLimit}`,
      [domain, domain]
    );
    return rows;
  }

  async persistDiscovered(item, duplicate = { kind: 'none', newsId: null }, { signal = null, lease = null } = {}) {
    if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
    if (!lease) {
      const error = new Error('Persistência editorial bloqueada sem um lease ativo.');
      error.code = 'DISCOVERY_LEASE_REQUIRED';
      throw error;
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      // Lock the run row in the same transaction as the article write. A contender cannot take over
      // the lease while this transaction writes, and a stale worker cannot pass this fencing check.
      await this.assertLease(connection, lease, signal);
      const [existing] = await connection.execute(
        `SELECT dr.news_id, n.title, n.source_id, n.metadata, s.rss_url AS source_rss_url,
                dr.provider AS discovery_provider, dr.dedupe_status AS discovery_status,
                dr.canonical_url, dr.source_domain
         FROM news_discovery_records dr JOIN news_v2 n ON n.id = dr.news_id
         LEFT JOIN news_sources s ON n.source_id = s.id
         WHERE dr.canonical_url = ? LIMIT 1 FOR UPDATE`, [item.canonicalUrl]
      );

      let newsId;
      let insertedArticle = false;
      let status = duplicate.kind === 'possible' ? 'possible_duplicate' : 'unique';
      if (existing[0]) {
        newsId = Number(existing[0].news_id);
        await this.backfillBraveSourceId(connection, existing[0], newsId, item, signal);
        status = 'exact_duplicate';
      } else if (duplicate.kind === 'exact' && duplicate.newsId) {
        newsId = duplicate.newsId;
        const [matchedArticle] = await connection.execute(
          `SELECT n.source_id, n.metadata, s.rss_url AS source_rss_url,
             EXISTS (SELECT 1 FROM news_discovery_records d WHERE d.news_id = n.id
               AND d.provider = 'brave' AND d.dedupe_status IN ('unique', 'possible_duplicate')) AS has_brave_origin
           FROM news_v2 n LEFT JOIN news_sources s ON n.source_id = s.id
           WHERE n.id = ? LIMIT 1 FOR UPDATE`, [newsId]
        );
        await this.backfillBraveSourceId(connection, matchedArticle[0], newsId, item, signal);
        status = 'exact_duplicate';
      } else {
        const sourceId = await this.getOrCreateBraveSource(connection, item);
        if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
        const metadata = JSON.stringify(item.metadata);
        const [inserted] = await connection.execute(
          `INSERT INTO news_v2
           (source_id, title, description, original_link, category, main_image, language, publication_date, status, score, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'coletada', 0, ?)`,
          [sourceId, item.title, item.description, item.originalUrl, item.category, item.imageUrl,
           item.language || 'pt-BR', item.publishedAt, metadata]
        );
        newsId = Number(inserted.insertId);
        insertedArticle = true;
      }

      const [record] = await connection.execute(
        `INSERT IGNORE INTO news_discovery_records
         (news_id, provider, provider_item_id, canonical_url, source_domain, dedupe_status, duplicate_of_news_id, discovered_at, metadata_json)
         VALUES (?, 'brave', NULL, ?, ?, ?, ?, ?, ?)`,
        [newsId, item.canonicalUrl, item.sourceDomain, status,
         status === 'possible_duplicate' ? duplicate.newsId : null,
         item.discoveredAt, JSON.stringify(item.metadata)]
      );
      if (record.affectedRows === 0) {
        const [concurrentRecord] = await connection.execute(
          `SELECT news_id FROM news_discovery_records WHERE provider = 'brave' AND canonical_url = ? LIMIT 1`,
          [item.canonicalUrl]
        );
        if (concurrentRecord[0]) {
          if (insertedArticle && Number(concurrentRecord[0].news_id) !== newsId) {
            await connection.execute('DELETE FROM news_v2 WHERE id = ?', [newsId]);
          }
          newsId = Number(concurrentRecord[0].news_id);
          status = 'exact_duplicate';
          insertedArticle = false;
        }
      }
      await this.assertLease(connection, lease, signal);
      if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
      await connection.commit();
      return { newsId, status, insertedRecord: record.affectedRows > 0,
        insertedArticle };
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') {
        const existing = await this.findCanonical(item.canonicalUrl);
        if (existing) return { newsId: Number(existing.news_id), status: 'exact_duplicate', insertedRecord: false };
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = DiscoveryRepository;
