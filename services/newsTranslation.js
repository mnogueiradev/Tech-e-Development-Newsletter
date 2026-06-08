const { franc } = require('franc');

const ISO3_TO_ISO2 = {
    eng: 'en',
    ita: 'it',
    spa: 'es',
    fra: 'fr',
    deu: 'de',
    nld: 'nl',
    rus: 'ru',
    jpn: 'ja',
    zho: 'zh',
};

const BRAZILIAN_HOST_PATTERNS = [
    /\.com\.br$/i,
    /\.org\.br$/i,
    /\.gov\.br$/i,
    /\.net\.br$/i,
    /olhardigital\.com\.br/i,
    /uol\.com\.br/i,
    /globo\.com/i,
    /g1\.globo/i,
    /tecmundo\.com\.br/i,
    /canaltech\.com\.br/i,
];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBrazilianSource(sourceOrUrl) {
    if (!sourceOrUrl) return false;
    const value = String(sourceOrUrl).toLowerCase();
    return BRAZILIAN_HOST_PATTERNS.some((pattern) => pattern.test(value));
}

function isCookieOrConsentText(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    if (/se accetti tutti i cookie|if you accept all cookies|accept all cookies|cookie di profilazione|uso de cookies|política de cookies/i.test(lower)) {
        return true;
    }
    return /cookie|consent|gdpr|profilazione|tracciamento|terze parti/i.test(lower) && text.length > 120;
}

function detectSourceLang(text, hostname = '') {
    if (!text || text.trim().length < 4) return null;

    const detected = franc(text, { minLength: 4, only: ['por', 'eng', 'ita', 'spa', 'fra', 'deu', 'nld'] });
    if (detected === 'por') return null;
    if (detected && detected !== 'und' && ISO3_TO_ISO2[detected]) {
        return ISO3_TO_ISO2[detected];
    }

    if (hostname) {
        const host = hostname.toLowerCase();
        if (isBrazilianSource(host)) return null;
        const tld = host.split('.').pop();
        const tldMap = { it: 'it', de: 'de', fr: 'fr', es: 'es', uk: 'en', jp: 'ja' };
        if (tldMap[tld]) return tldMap[tld];
    }

    return 'en';
}

function extractHostname(item) {
    if (item.source && item.source.includes('.')) return item.source;
    try {
        return new URL(item.link).hostname;
    } catch {
        return item.source || '';
    }
}

async function translateWithMyMemory(text, sourceLang) {
    const trimmed = text.trim().slice(0, 450);
    if (!trimmed) return text;

    const langpair = `${sourceLang}|pt-BR`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${langpair}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.responseStatus === 200 && data.responseData?.translatedText) {
            const translated = data.responseData.translatedText.trim();
            if (translated && !/^MYMEMORY WARNING/i.test(translated)) {
                return translated;
            }
        }

        console.warn(`[TRADUÇÃO] Falha (${sourceLang}→pt-BR):`, data.responseDetails || 'resposta vazia');
    } catch (err) {
        console.warn('[TRADUÇÃO] Erro na API:', err.message);
    }

    return text;
}

async function translateField(text, hostname) {
    const sourceLang = detectSourceLang(text, hostname);
    if (!sourceLang) return text;
    await sleep(300);
    return translateWithMyMemory(text, sourceLang);
}

async function translateNewsItem(item) {
    const hostname = extractHostname(item);
    const brazilian = isBrazilianSource(hostname) || isBrazilianSource(item.source);

    const titleLang = detectSourceLang(item.title, hostname);
    const needsTitleTranslation = !brazilian && titleLang;

    let description = item.description || '';
    if (isCookieOrConsentText(description)) {
        description = '';
    }

    const descLang = description ? detectSourceLang(description, hostname) : null;
    const needsDescTranslation = !brazilian && descLang && description;

    if (!needsTitleTranslation && !needsDescTranslation) {
        return { ...item, description };
    }

    console.log(`[TRADUÇÃO] Traduzindo notícia de ${hostname || item.source} (${titleLang || descLang}→pt-BR)`);

    const [title, translatedDescription] = await Promise.all([
        needsTitleTranslation ? translateField(item.title, hostname) : item.title,
        needsDescTranslation ? translateField(description, hostname) : description,
    ]);

    return {
        ...item,
        title,
        description: translatedDescription,
    };
}

async function translateNewsItems(items) {
    const translated = [];
    for (const item of items) {
        translated.push(await translateNewsItem(item));
    }
    return translated;
}

module.exports = {
    translateNewsItems,
    isBrazilianSource,
    isCookieOrConsentText,
};
