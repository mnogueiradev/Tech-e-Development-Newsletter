const BRAVE_PROVIDER = 'brave';

function readMetadata(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function isBraveDiscovered(item = {}) {
  const metadata = readMetadata(item.metadata);
  const provider = metadata.provider || item.provider;
  const sourceUrl = String(item.source_rss_url || item.rss_url || '');
  const discoveryProvider = String(item.discovery_provider || '').toLowerCase();
  const discoveryStatus = String(item.discovery_status || '').toLowerCase();
  const persistentDiscovery = discoveryProvider === BRAVE_PROVIDER &&
    ['unique', 'possible_duplicate'].includes(discoveryStatus);
  return String(provider || '').toLowerCase() === BRAVE_PROVIDER ||
    /^brave:\/\//i.test(sourceUrl) ||
    item.has_brave_origin === true || Number(item.has_brave_origin) === 1 ||
    persistentDiscovery;
}

function isLegacyNews(item = {}) {
  return !isBraveDiscovered(item);
}

function legacyNewsSql(alias = 'n', { includeDiscovery = true } = {}) {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new TypeError('Alias SQL inválido.');
  const clauses = [
    `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alias}.metadata, '$.provider')), '') <> '${BRAVE_PROVIDER}'`,
    `NOT EXISTS (SELECT 1 FROM news_sources brave_source
      WHERE brave_source.id = ${alias}.source_id AND LOWER(brave_source.rss_url) LIKE 'brave://%')`
  ];
  if (includeDiscovery) {
    clauses.push(`NOT EXISTS (SELECT 1 FROM news_discovery_records brave_record
      WHERE brave_record.news_id = ${alias}.id AND brave_record.provider = '${BRAVE_PROVIDER}'
        AND brave_record.dedupe_status IN ('unique', 'possible_duplicate'))`);
  }
  return clauses.map(clause => `(${clause})`).join(' AND ');
}

function isMissingDiscoveryTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && /news_discovery_records/i.test(String(error.message || ''));
}

async function getNewsOriginRows(pool, ids) {
  const uniqueIds = [...new Set((ids || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const baseSelect = `SELECT n.id, n.metadata, s.rss_url AS source_rss_url
    FROM news_v2 n LEFT JOIN news_sources s ON n.source_id = s.id
    WHERE n.id IN (${placeholders})`;
  try {
    const [rows] = await pool.execute(
      `SELECT n.id, n.metadata, s.rss_url AS source_rss_url,
         EXISTS (SELECT 1 FROM news_discovery_records d WHERE d.news_id = n.id
           AND d.provider = '${BRAVE_PROVIDER}' AND d.dedupe_status IN ('unique', 'possible_duplicate')) AS has_brave_origin
       FROM news_v2 n LEFT JOIN news_sources s ON n.source_id = s.id
       WHERE n.id IN (${placeholders})`, uniqueIds
    );
    return rows;
  } catch (error) {
    if (!isMissingDiscoveryTable(error)) throw error;
    const [rows] = await pool.execute(baseSelect, uniqueIds);
    return rows;
  }
}

module.exports = { isBraveDiscovered, isLegacyNews, legacyNewsSql, isMissingDiscoveryTable, getNewsOriginRows };
