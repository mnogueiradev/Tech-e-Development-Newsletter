const crypto = require('node:crypto');

function toSqlUtc(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('scheduledAt inválido.');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

class EditorialDiscoveryRunRepository {
  constructor(pool) { this.pool = pool; }

  async claim({ scheduleId, editionDate, timezone, scheduledAt, leaseSeconds = 2700, maxAttempts = 3, lockToken = crypto.randomUUID() }) {
    await this.pool.execute(
      `INSERT IGNORE INTO editorial_discovery_runs
       (schedule_id, edition_date, timezone, scheduled_at, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [scheduleId, editionDate, timezone, toSqlUtc(scheduledAt)]
    );
    const [result] = await this.pool.execute(
      `UPDATE editorial_discovery_runs
       SET status = 'running', lock_token = ?, lease_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
           attempt_count = attempt_count + 1, started_at = UTC_TIMESTAMP(), completed_at = NULL,
           last_error = NULL
       WHERE schedule_id = ? AND edition_date = ? AND timezone = ? AND attempt_count < ?
         AND (status = 'pending'
           OR (status = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= UTC_TIMESTAMP())
           OR (status = 'running' AND lease_expires_at <= UTC_TIMESTAMP()))`,
      [lockToken, Math.max(60, Math.floor(leaseSeconds)), scheduleId, editionDate, timezone, Math.max(1, Math.floor(maxAttempts))]
    );
    if (!result.affectedRows) return null;
    const [rows] = await this.pool.execute(
      `SELECT attempt_count FROM editorial_discovery_runs
       WHERE schedule_id = ? AND edition_date = ? AND timezone = ? AND lock_token = ? LIMIT 1`,
      [scheduleId, editionDate, timezone, lockToken]
    );
    return rows[0] ? { lockToken, attempt: Number(rows[0].attempt_count) } : null;
  }

  async complete({ scheduleId, editionDate, timezone, lockToken, status, summary, durationMs }) {
    const [result] = await this.pool.execute(
      `UPDATE editorial_discovery_runs
       SET status = ?, completed_at = UTC_TIMESTAMP(), lease_expires_at = NULL, next_attempt_at = NULL,
           result_count = ?, new_article_count = ?, duplicate_count = ?, rejected_count = ?,
           failure_count = ?, duration_ms = ?, last_error = ?
       WHERE schedule_id = ? AND edition_date = ? AND timezone = ? AND lock_token = ?
         AND status = 'running' AND lease_expires_at > UTC_TIMESTAMP()`,
      [status, summary.resultsFound || 0, summary.newArticles || 0, summary.duplicates || 0,
       summary.rejected || 0, summary.failures || 0, Math.max(0, Math.floor(durationMs)),
       summary.errorMessage || null, scheduleId, editionDate, timezone, lockToken]
    );
    return result.affectedRows > 0;
  }

  async renew({ scheduleId, editionDate, timezone, lockToken, leaseSeconds = 2700 }) {
    const [result] = await this.pool.execute(
      `UPDATE editorial_discovery_runs
       SET lease_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)
       WHERE schedule_id = ? AND edition_date = ? AND timezone = ? AND lock_token = ?
         AND status = 'running' AND lease_expires_at > UTC_TIMESTAMP()`,
      [Math.max(60, Math.floor(leaseSeconds)), scheduleId, editionDate, timezone, lockToken]
    );
    return result.affectedRows > 0;
  }

  async fail({ scheduleId, editionDate, timezone, lockToken, error, summary = {}, retryDelayMinutes = 15, durationMs = 0 }) {
    const [result] = await this.pool.execute(
      `UPDATE editorial_discovery_runs
       SET status = 'failed', completed_at = UTC_TIMESTAMP(), lease_expires_at = NULL,
           next_attempt_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), duration_ms = ?,
           result_count = ?, new_article_count = ?, duplicate_count = ?, rejected_count = ?,
           failure_count = ?, last_error = ?
       WHERE schedule_id = ? AND edition_date = ? AND timezone = ? AND lock_token = ?
         AND status = 'running' AND lease_expires_at > UTC_TIMESTAMP()`,
      [Math.max(1, Math.floor(retryDelayMinutes)), Math.max(0, Math.floor(durationMs)),
       summary.resultsFound || 0, summary.newArticles || 0, summary.duplicates || 0, summary.rejected || 0,
       summary.failures || 1, String(error?.message || error || 'Falha sem detalhes').slice(0, 4000),
       scheduleId, editionDate, timezone, lockToken]
    );
    return result.affectedRows > 0;
  }
}

module.exports = EditorialDiscoveryRunRepository;
module.exports.toSqlUtc = toSqlUtc;
