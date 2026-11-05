const { normalizeUrl } = require('./newsNormalizer');

function normalizeTitle(title) {
  return String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(left, right) {
  const a = new Set(normalizeTitle(left).split(' ').filter(word => word.length > 2));
  const b = new Set(normalizeTitle(right).split(' ').filter(word => word.length > 2));
  if (a.size < 3 || b.size < 3) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function detectDuplicate(item, records = [], threshold = 0.82) {
  for (const row of records) {
    if (normalizeUrl(row.canonical_url || row.original_link) === item.canonicalUrl) {
      return { kind: 'exact', newsId: Number(row.news_id || row.id), similarity: 1 };
    }
  }
  for (const row of records) {
    if (String(row.source_domain || '').toLowerCase() !== item.sourceDomain.toLowerCase()) continue;
    const similarity = titleSimilarity(item.title, row.title);
    if (similarity >= threshold) {
      return { kind: 'possible', newsId: Number(row.news_id || row.id), similarity };
    }
  }
  return { kind: 'none', newsId: null, similarity: 0 };
}

module.exports = { normalizeTitle, titleSimilarity, detectDuplicate };
