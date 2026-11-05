const API_URL = 'https://api.search.brave.com/res/v1/news/search';

class BraveApiError extends Error {
  constructor(message, { status = null, code = null, retryable = false } = {}) {
    super(message);
    this.name = 'BraveApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function getFreshness({ publishedAfter, publishedBefore } = {}) {
  if (!publishedAfter && !publishedBefore) return 'pd';
  const toDate = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('Datas de publicação inválidas.');
    return date.toISOString().slice(0, 10);
  };
  const end = publishedBefore ? toDate(publishedBefore) : new Date().toISOString().slice(0, 10);
  let start;
  if (publishedAfter) start = toDate(publishedAfter);
  else {
    const endDate = new Date(`${end}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() - 30);
    start = endDate.toISOString().slice(0, 10);
  }
  if (start > end) throw new TypeError('publishedAfter deve ser anterior ou igual a publishedBefore.');
  return `${start}to${end}`;
}

function retryAfterMs(response, fallbackMs) {
  const value = response.headers?.get?.('retry-after');
  if (!value) return fallbackMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? fallbackMs : Math.max(0, dateMs - Date.now());
}

class BraveNewsService {
  constructor({ apiKey = process.env.BRAVE_API_KEY, fetchImpl = globalThis.fetch, timeoutMs = 12000, maxRetries = 2, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.sleep = sleep;
  }

  async search(query, options = {}) {
    if (!this.apiKey) throw new BraveApiError('BRAVE_API_KEY não configurada.', { code: 'MISSING_API_KEY' });
    if (typeof query?.q !== 'string' || !query.q.trim() || query.q.length > 400) {
      throw new TypeError('Cada consulta Brave precisa de q com até 400 caracteres.');
    }
    const requestedCount = Number(options.count || query.count || 20);
    const requestedPages = Number(options.maxPages || 1);
    if (!Number.isFinite(requestedCount) || !Number.isFinite(requestedPages)) throw new TypeError('count/maxPages devem ser números válidos.');
    const count = Math.min(50, Math.max(1, Math.floor(requestedCount)));
    const maxPages = Math.min(10, Math.max(1, Math.floor(requestedPages)));
    const freshness = getFreshness(options);
    const allResults = [];

    for (let offset = 0; offset < maxPages; offset++) {
      const url = new URL(API_URL);
      url.searchParams.set('q', query.q.trim());
      url.searchParams.set('count', String(count));
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('freshness', freshness);
      url.searchParams.set('search_lang', query.searchLang || 'pt');
      url.searchParams.set('country', query.country || 'BR');
      url.searchParams.set('safesearch', 'moderate');

      const payload = await this.request(url, { signal: options.signal });
      if (!payload || !Array.isArray(payload.results)) {
        throw new BraveApiError('Resposta Brave inválida: results ausente ou não é uma lista.', { code: 'INVALID_RESPONSE' });
      }
      allResults.push(...payload.results);
      if (payload.results.length < count) break;
    }
    return allResults;
  }

  async request(url, { signal } = {}) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (signal?.aborted) throw signal.reason || new Error('Consulta cancelada.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const abortFromParent = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', abortFromParent, { once: true });
      let response;
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json', 'X-Subscription-Token': this.apiKey },
          signal: controller.signal
        });
      } catch (error) {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abortFromParent);
        if (signal?.aborted) throw signal.reason || error;
        if (attempt < this.maxRetries) {
          await this.sleep(Math.min(1000 * (2 ** attempt), 8000));
          continue;
        }
        throw new BraveApiError(error.name === 'AbortError' ? 'Timeout ao consultar Brave News Search.' : 'Falha de conexão com Brave News Search.', {
          code: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', retryable: true
        });
      }
      if (response.ok) {
        try {
          const body = await response.json();
          clearTimeout(timeout);
          signal?.removeEventListener('abort', abortFromParent);
          return body;
        } catch {
          clearTimeout(timeout);
          signal?.removeEventListener('abort', abortFromParent);
          throw new BraveApiError('Brave retornou JSON inválido.', { status: response.status, code: 'INVALID_JSON' });
        }
      }

      let errorCode = null;
      try { errorCode = (await response.clone?.().json())?.error?.code || null; } catch {}
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromParent);
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(retryAfterMs(response, Math.min(1000 * (2 ** attempt), 8000)));
        continue;
      }
      const message = response.status === 401 || response.status === 403
        ? 'Brave rejeitou a autenticação (verifique chave e plano).'
        : response.status === 429 ? 'Limite/quota da Brave API atingido.'
          : `Brave News Search retornou HTTP ${response.status}.`;
      throw new BraveApiError(message, { status: response.status, code: errorCode || (response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR'), retryable });
    }
  }
}

module.exports = { BraveNewsService, BraveApiError, getFreshness, API_URL };
