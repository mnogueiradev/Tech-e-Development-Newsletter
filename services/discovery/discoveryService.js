const defaultQueries = require('../../config/discoveryQueries');
const DiscoveryLogRepository = require('../../repositories/discoveryLogRepository');
const DiscoveryRepository = require('../../repositories/discoveryRepository');
const { BraveNewsService } = require('./braveNewsService');
const { normalizeNewsResult, isWithinPublicationWindow } = require('./newsNormalizer');
const { detectDuplicate } = require('./newsDeduplicator');

async function discoverNews({ pool = null, brave = new BraveNewsService(), queries = defaultQueries,
  publishedAfter = null, publishedBefore = null, count = 20, maxPages = 1, persist = Boolean(pool), now = () => new Date(),
  discoveryRepository = null, discoveryLogRepository = null, signal = null, persistenceLease = null } = {}) {
  if (!Array.isArray(queries) || queries.length === 0) throw new TypeError('Informe ao menos uma consulta Brave.');
  if (persist && !pool) throw new TypeError('pool é obrigatório quando persist=true.');
  if (persist && !persistenceLease) {
    const error = new Error('Persistência editorial exige uma execução manual ou agendada com lease ativo.');
    error.code = 'DISCOVERY_LEASE_REQUIRED';
    throw error;
  }

  const logRepo = persist ? (discoveryLogRepository || new DiscoveryLogRepository(pool)) : null;
  const discoveryRepo = persist ? (discoveryRepository || new DiscoveryRepository(pool)) : null;
  const summary = { resultsFound: 0, newArticles: 0, duplicates: 0, rejected: 0, failures: 0, persistedIds: [], queries: [] };

  for (const query of queries) {
    if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
    const startedAt = now();
    let logId = null;
    let results = [];
    let insertedCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    let status = 'success';
    let errorMessage = null;
    if (persist) {
      logId = await logRepo.create({ provider: 'brave', queryText: query.q, startedAt, metadata: { queryId: query.id || null, category: query.category || null } });
    }
    if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');

    try {
      results = await brave.search(query, { publishedAfter, publishedBefore, count, maxPages, signal });
      if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
      summary.resultsFound += results.length;
      for (const result of results) {
        if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
        const discoveredAt = now();
        const item = normalizeNewsResult(result, query, discoveredAt);
        if (!item || !isWithinPublicationWindow(item, publishedAfter, publishedBefore)) {
          rejectedCount++;
          continue;
        }

        if (!persist) {
          summary.newArticles++;
          continue;
        }

        try {
          const canonicalMatch = await discoveryRepo.findCanonical(item.canonicalUrl);
          if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
          let duplicate = canonicalMatch
            ? { kind: 'exact', newsId: Number(canonicalMatch.news_id), similarity: 1 }
            : detectDuplicate(item, await discoveryRepo.findTitleCandidates(item.sourceDomain));
          if (signal?.aborted) throw signal.reason || new Error('Descoberta cancelada.');
          const saved = await discoveryRepo.persistDiscovered(item, duplicate, { signal, lease: persistenceLease });
          if (saved.insertedArticle) insertedCount++;
          if (saved.status === 'exact_duplicate') duplicateCount++;
          if (saved.insertedRecord && saved.newsId) summary.persistedIds.push(saved.newsId);
        } catch (error) {
          if (error.code === 'DISCOVERY_LEASE_LOST' || error.code === 'DISCOVERY_LEASE_REQUIRED') throw error;
          rejectedCount++;
          status = 'partial';
          errorMessage = errorMessage || 'Uma ou mais notícias não puderam ser persistidas.';
          console.error(`[DISCOVERY] Falha ao persistir resultado da consulta ${query.id || 'custom'}: ${error.message}`);
        }
      }
    } catch (error) {
      if (error.code === 'DISCOVERY_LEASE_LOST' || error.code === 'DISCOVERY_LEASE_REQUIRED') throw error;
      status = 'failed';
      errorMessage = error.message;
      summary.failures++;
      console.error(`[DISCOVERY] Consulta ${query.id || 'custom'} falhou: ${error.message}`);
    }

    const completedAt = now();
    summary.newArticles += persist ? insertedCount : 0;
    summary.duplicates += duplicateCount;
    summary.rejected += rejectedCount;
    summary.queries.push({ id: query.id || null, results: results.length, inserted: insertedCount, duplicates: duplicateCount, rejected: rejectedCount, status });

    if (persist && logId && !signal?.aborted) {
      await logRepo.complete(logId, {
        completedAt, resultsCount: results.length, insertedCount, duplicateCount, rejectedCount, status, errorMessage
      });
    }
  }

  summary.persistedIds = [...new Set(summary.persistedIds)];
  summary.status = summary.failures || summary.queries.some(query => query.status === 'partial') ? 'partial' : 'success';
  return summary;
}

module.exports = { discoverNews };
