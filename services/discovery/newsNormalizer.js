const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;

function normalizeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const originalProtocol = url.protocol;
    if ((originalProtocol === 'http:' && url.port === '80') || (originalProtocol === 'https:' && url.port === '443')) url.port = '';
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    const normalized = url.toString();
    return normalized.length <= 700 ? normalized : null;
  } catch { return null; }
}

function parsePublicationDate(result) {
  const candidate = result?.page_age;
  if (typeof candidate === 'string') {
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof result?.age === 'string') {
    const match = result.age.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i);
    if (match) {
      const amount = Number(match[1]);
      const unitMs = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };
      return new Date(Date.now() - amount * unitMs[match[2].toLowerCase()]);
    }
  }
  return null;
}

function normalizeNewsResult(result, query, discoveredAt = new Date()) {
  if (!result || typeof result.title !== 'string' || !result.title.trim() || typeof result.url !== 'string') return null;
  const originalUrl = result.url.trim();
  if (originalUrl.length > 700) return null;
  const canonicalUrl = normalizeUrl(originalUrl);
  if (!canonicalUrl) return null;
  let parsed;
  try { parsed = new URL(canonicalUrl); } catch { return null; }
  const sourceName = result.profile?.long_name || result.profile?.name || result.meta_url?.hostname || parsed.hostname;
  const sourceDomain = typeof result.meta_url?.hostname === 'string'
    ? result.meta_url.hostname.toLowerCase().replace(/^www\./, '')
    : parsed.hostname;
  return {
    title: result.title.trim().slice(0, 500),
    description: typeof result.description === 'string' ? result.description.trim() : null,
    originalUrl,
    canonicalUrl,
    sourceName: String(sourceName).slice(0, 100),
    sourceDomain: sourceDomain.slice(0, 255),
    language: query.searchLang || null,
    publishedAt: parsePublicationDate(result),
    discoveredAt,
    imageUrl: result.thumbnail?.original || result.thumbnail?.src || null,
    category: query.category || 'tecnologia',
    metadata: {
      provider: 'brave',
      queryId: query.id || null,
      sourceName: String(sourceName).slice(0, 100),
      age: result.age || null,
      pageAge: result.page_age || null,
      pageFetched: result.page_fetched || null,
      breaking: typeof result.breaking === 'boolean' ? result.breaking : null,
      extraSnippets: Array.isArray(result.extra_snippets) ? result.extra_snippets.slice(0, 5).map(value => String(value).slice(0, 1000)) : []
    }
  };
}

function isWithinPublicationWindow(item, publishedAfter, publishedBefore) {
  const after = publishedAfter ? new Date(publishedAfter).getTime() : -Infinity;
  const before = publishedBefore ? new Date(publishedBefore).getTime() : Infinity;
  if ((publishedAfter && Number.isNaN(after)) || (publishedBefore && Number.isNaN(before))) {
    throw new TypeError('publishedAfter/publishedBefore deve ser uma data válida.');
  }
  if (!item.publishedAt) return !publishedAfter && !publishedBefore;
  const published = item.publishedAt.getTime();
  return published >= after && published <= before;
}

module.exports = { normalizeUrl, normalizeNewsResult, isWithinPublicationWindow, parsePublicationDate };
