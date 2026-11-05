class DiscoveryRecordRepository {
  constructor(pool) { this.pool = pool; }

  async create({ newsId, provider, providerItemId = null, canonicalUrl, sourceDomain, discoveredAt, metadata = null }) {
    const [result] = await this.pool.execute(
      `INSERT INTO news_discovery_records
       (news_id, provider, provider_item_id, canonical_url, source_domain, discovered_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newsId, provider, providerItemId, canonicalUrl, sourceDomain, discoveredAt,
       metadata == null ? null : JSON.stringify(metadata)]
    );
    return result.insertId;
  }
}

module.exports = DiscoveryRecordRepository;
