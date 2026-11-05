class DiscoveryRepository {
  constructor(pool) { this.pool = pool; }

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

  async persistDiscovered(item, duplicate = { kind: 'none', newsId: null }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.execute(
        `SELECT dr.news_id, n.title, dr.canonical_url, dr.source_domain
         FROM news_discovery_records dr JOIN news_v2 n ON n.id = dr.news_id
         WHERE dr.canonical_url = ? LIMIT 1 FOR UPDATE`, [item.canonicalUrl]
      );

      let newsId;
      let insertedArticle = false;
      let status = duplicate.kind === 'possible' ? 'possible_duplicate' : 'unique';
      if (existing[0]) {
        newsId = Number(existing[0].news_id);
        status = 'exact_duplicate';
      } else if (duplicate.kind === 'exact' && duplicate.newsId) {
        newsId = duplicate.newsId;
        status = 'exact_duplicate';
      } else {
        const metadata = JSON.stringify(item.metadata);
        const [inserted] = await connection.execute(
          `INSERT INTO news_v2
           (source_id, title, description, original_link, category, main_image, language, publication_date, status, score, metadata)
           VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, 'coletada', 0, ?)`,
          [item.title, item.description, item.originalUrl, item.category, item.imageUrl,
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
