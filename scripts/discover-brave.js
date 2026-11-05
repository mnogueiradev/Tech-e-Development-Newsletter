require('dotenv').config();
const mysql = require('mysql2/promise');
const { assertExpectedDatabaseFingerprint } = require('../repositories/databaseIdentity');
const defaultQueries = require('../config/discoveryQueries');
const { discoverNews } = require('../services/discovery/discoveryService');

async function main() {
  const persist = process.argv.includes('--persist');
  if (persist && process.env.ALLOW_EDITORIAL_DISCOVERY_WRITES !== '1') {
    throw new Error('Para persistir, defina ALLOW_EDITORIAL_DISCOVERY_WRITES=1 conscientemente. Sem --persist a operação é somente leitura.');
  }
  let pool = null;
  if (persist) {
    if (!process.env.TIDB_URL) throw new Error('TIDB_URL não configurada.');
    assertExpectedDatabaseFingerprint(process.env.TIDB_URL, process.env.TIDB_EXPECTED_FINGERPRINT);
    pool = mysql.createPool({ uri: process.env.TIDB_URL, ssl: { rejectUnauthorized: true }, connectionLimit: 2 });
  }
  try {
    const id = process.env.BRAVE_DISCOVERY_QUERY_ID;
    const queries = id ? defaultQueries.filter(query => query.id === id) : defaultQueries;
    if (id && !queries.length) throw new Error(`Consulta não encontrada: ${id}`);
    const summary = await discoverNews({ pool, queries, persist });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failures > 0 || summary.rejected > 0) process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

main().catch(error => {
  console.error('[BRAVE DISCOVERY]', error.message);
  process.exitCode = 1;
});
