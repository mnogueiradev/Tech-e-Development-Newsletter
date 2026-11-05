require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { assertExpectedDatabaseFingerprint } = require('../repositories/databaseIdentity');
const { runEditorialMigrations } = require('../repositories/migrationRunner');

async function main() {
  if (!process.env.TIDB_URL) throw new Error('TIDB_URL não configurada.');
  assertExpectedDatabaseFingerprint(process.env.TIDB_URL, process.env.TIDB_EXPECTED_FINGERPRINT);
  const pool = mysql.createPool({ uri: process.env.TIDB_URL, ssl: { rejectUnauthorized: true }, connectionLimit: 2 });
  try {
    const migrations = ['001_editorial_studio', '002_editorial_discovery_scheduler'].map(version => ({
      version,
      sql: fs.readFileSync(path.join(__dirname, '..', 'migrations', `${version}.sql`), 'utf8')
    }));
    const applied = await runEditorialMigrations(pool, migrations);
    console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Schema editorial já está atualizado.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('[EDITORIAL MIGRATION]', error.message);
  process.exitCode = 1;
});
