class DiscoveryLogRepository {
  constructor(pool) { this.pool = pool; }

  async create({ provider, sourceId = null, queryText = null, startedAt, completedAt = null,
    resultsCount = 0, insertedCount = 0, duplicateCount = 0, status = 'running', errorMessage = null, metadata = null }) {
    const [result] = await this.pool.execute(
      `INSERT INTO news_discovery_logs
       (provider, source_id, query_text, started_at, completed_at, results_count, inserted_count,
        duplicate_count, status, error_message, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [provider, sourceId, queryText, startedAt, completedAt, resultsCount, insertedCount,
       duplicateCount, status, errorMessage, metadata == null ? null : JSON.stringify(metadata)]
    );
    return result.insertId;
  }

  async complete(id, { completedAt, resultsCount, insertedCount, duplicateCount, rejectedCount = 0, status, errorMessage = null }) {
    const [result] = await this.pool.execute(
      `UPDATE news_discovery_logs
       SET completed_at = ?, results_count = ?, inserted_count = ?, duplicate_count = ?,
           rejected_count = ?, status = ?, error_message = ?
       WHERE id = ?`,
      [completedAt, resultsCount, insertedCount, duplicateCount, rejectedCount, status, errorMessage, id]
    );
    return result.affectedRows;
  }
}

module.exports = DiscoveryLogRepository;
