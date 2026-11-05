class EditorialAuditRepository {
  constructor(pool) { this.pool = pool; }

  async record({ actor = null, action, entityType, entityId, details = null }) {
    const [result] = await this.pool.execute(
      `INSERT INTO editorial_audit_logs (actor, action, entity_type, entity_id, details_json)
       VALUES (?, ?, ?, ?, ?)`,
      [actor, action, entityType, entityId, details == null ? null : JSON.stringify(details)]
    );
    return result.insertId;
  }
}

module.exports = EditorialAuditRepository;
