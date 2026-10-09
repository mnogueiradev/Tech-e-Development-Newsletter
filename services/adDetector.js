const DISCLOSURE_PATTERNS = [
    /^\s*(?:\[(?:ad|sponsored|advertisement|advertorial|publipost|publi)\]|\((?:ad|sponsored|advertisement|advertorial|publipost|publi)\)|(?:ad|sponsored|advertisement|advertorial|publipost|publi)\s*[:|—-])/,
    /\b(?:sponsored|paid|partner)\s+(?:content|post|article|story)\b/,
    /\b(?:sponsored|presented|brought\s+to\s+you)\s+by\b/,
    /\b(?:this|the)\s+(?:content|post|article|story)\s+(?:is|was)\s+(?:sponsored|paid)\b/,
    /\bpaid\s+partnership\b|\bin\s+partnership\s+with\b/,
    /\badvertorial\b|\badvertisement\b|\bbrand\s+content\b/,
    /\bconteudo\s+(?:patrocinado|pago|de\s+marca|em\s+parceria\s+com)\b/,
    /\b(?:post|artigo|material)\s+(?:patrocinado|publicitario)\b/,
    /\bpublieditorial\b|\bpublipost\b/,
    /\bparceria\s+(?:paga|patrocinada)\b/,
    /\bpatrocinad[oa]\s+por\b|\bproduzido\s+em\s+parceria\s+com\b|\bconteudo\s+oferecido\s+por\b/,
    /^\s*(?:press|news)\s+release\b/,
    /^\s*comunicado\s+de\s+imprensa\b/,
    /#(?:publi|ad)\b/
];

const PROMOTION_TERMS = [
    /\b(?:promocao|desconto|discount|cupom|coupon|codigo\s+promocional|promo\s+code|oferta\s+imperdivel|ofertas?\s+(?:do\s+dia|de\s+hoje)|deals?\s+roundup|daily\s+deals|on\s+sale)\b/,
    /\b(?:black\s+friday|prime\s+day|frete\s+gratis|limited[- ]time\s+offer|flash\s+sale|sale\s+(?:today|now))\b/
];

const DIRECT_CALLS_TO_BUY = [
    /\b(?:compre|comprar|garanta|adquira|assine|aproveite)\s+(?:agora|ja|o\s+seu|a\s+sua)\b/,
    /\b(?:buy|shop|order|subscribe)\s+(?:now|today)\b/,
    /\buse\s+(?:o\s+)?(?:cupom|codigo)\b/,
    /\b(?:start|claim)\s+your\s+(?:free\s+trial|discount)\b/,
    /\bsaiba\s+onde\s+comprar\b/
];

function toPlainText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(toPlainText).join(' ');
    if (typeof value === 'object') {
        return Object.values(value).map(toPlainText).join(' ');
    }

    return String(value)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;|&#34;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/\s+/g, ' ')
        .trim();
}

function normalize(value) {
    return toPlainText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function classifyAdvertisement(item = {}) {
    const title = normalize(item.title);
    const sourceName = normalize(item.source_name || item.source || '');
    const summary = normalize([
        item.description,
        item.summary,
        item.contentSnippet,
        item.content_snippet
    ].filter(Boolean).join(' '));
    const body = normalize(item.full_content || item['content:encoded'] || item.content || '');
    const labels = normalize([item.categories, item.tags, item.category].filter(Boolean).map(toPlainText).join(' '));
    const link = normalize(item.original_link || item.link || '');

    // Disclosure labels usually appear in the headline, feed labels, or the article's opening.
    const disclosureText = [title, summary, labels, body.slice(0, 1600)].join(' ');
    const disclosure = DISCLOSURE_PATTERNS.find(pattern => pattern.test(disclosureText));
    if (disclosure) {
        return { isAdvertisement: true, reasons: ['disclosure of sponsored or paid content'] };
    }

    const articleText = [title, summary, body].join(' ');
    if (/\b(?:affiliate\s+links?|may\s+earn\s+(?:a\s+)?commission|commission\s+when\s+you\s+(?:buy|purchase)|links?\s+de\s+afiliados|podemos\s+receber\s+comissao|ganhamos\s+comissao)\b/.test(articleText)) {
        return { isAdvertisement: true, reasons: ['affiliate or commission disclosure'] };
    }

    if (/\bhacker\s+news\b/.test(sourceName) && /^\s*(?:show\s+hn|ask\s+hn)\s*:/i.test(title)) {
        return { isAdvertisement: true, reasons: ['self-promotional community post'] };
    }

    if (/\b(?:sponsored|advertising|advertisement|advertorial|promoted|publipost|publi)\b/.test(labels)) {
        return { isAdvertisement: true, reasons: ['advertising label in feed metadata'] };
    }

    if (/\/(?:sponsored|advertorial|paid-content|brand-studio)(?:\/|$)/.test(link)) {
        return { isAdvertisement: true, reasons: ['advertising label in article URL'] };
    }

    // Deal roundups and coupon posts are commercial content, even when the feed omits an ad label.
    if (PROMOTION_TERMS.some(pattern => pattern.test(title))) {
        return { isAdvertisement: true, reasons: ['headline focused on a deal, discount, or promotion'] };
    }

    const salesCopy = [title, summary].join(' ');
    const articleSalesCopy = [salesCopy, body.slice(0, 5000)].join(' ');
    const directCall = DIRECT_CALLS_TO_BUY.some(pattern => pattern.test(articleSalesCopy));
    const promotionTermCount = PROMOTION_TERMS.filter(pattern => pattern.test(salesCopy)).length;
    if (directCall || promotionTermCount >= 2) {
        return { isAdvertisement: true, reasons: ['purchase call-to-action or repeated sales language'] };
    }

    return { isAdvertisement: false, reasons: [] };
}

module.exports = { classifyAdvertisement };
