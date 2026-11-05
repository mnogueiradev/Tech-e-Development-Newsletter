const crypto = require('crypto');

function parseMigration(sql) {
  return sql.split(/;\s*(?:\r?\n|$)/).map(statement => statement.trim()).filter(Boolean);
}

async function runEditorialMigrations(pool, migrations) {
  await pool.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const applied = [];
  for (const migration of [...migrations].sort((a, b) => a.version.localeCompare(b.version))) {
    const checksum = crypto.createHash('sha256').update(migration.sql).digest('hex');
    const [rows] = await pool.execute('SELECT checksum FROM schema_migrations WHERE version = ?', [migration.version]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) throw new Error(`Migration ${migration.version} já aplicada com checksum diferente.`);
      continue;
    }

    try {
      for (const statement of parseMigration(migration.sql)) await pool.execute(statement);
      await pool.execute('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [migration.version, checksum]);
      applied.push(migration.version);
    } catch (error) {
      error.message = `Migration ${migration.version} falhou. DDL MySQL/TiDB pode ter sido parcialmente aplicado; corrija a causa e execute novamente (DDL usa IF NOT EXISTS). ${error.message}`;
      throw error;
    }
  }
  return applied;
}

module.exports = { parseMigration, runEditorialMigrations };
