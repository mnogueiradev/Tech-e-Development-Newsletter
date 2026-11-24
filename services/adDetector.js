const DISCLOSURE_PATTERNS = [
    /^\s*(?:\[(?:ad|sponsored|advertisement|advertorial|publipost|publi)\]|\((?:ad|sponsored|advertisement|advertorial|publipost|publi)\)|(?:ad|sponsored|advertisement|advertorial|publipost|publi)\s*[:|—-])/,
    /\b(?:sponsored|paid|partner)\s+(?:content|post|article|story)\b/,
    /\b(?:sponsored|presented|brought\s+to\s+you)\s+by\b/,
    /\b(?:this|the)\s+(?:content|post|article|story)\s+(?:is|was)\s+(?:sponsored|paid)\b/,
    /\bpaid\s+partnership\b|\bin\s+partnership\s+with\b|\bpaid\s+promotion\b|\bcommercial\s+partnership\b/,
    /\badvertorial\b|\badvertisement\b|\bbrand\s+content\b/,
    /\bconteudo\s+(?:patrocinado|pago|de\s+marca|em\s+parceria\s+com)\b/,
    /\b(?:post|artigo|material)\s+(?:patrocinado|publicitario)\b/,
    /\bpublieditorial\b|\bpublipost\b/,
    /\bparceria\s+(?:paga|patrocinada)\b/,
    /\bpatrocinad[oa]\s+por\b|\bproduzido\s+em\s+parceria\s+com\b|\bconteudo\s+oferecido\s+por\b|\bpromocao\s+paga\b/,
    /\b(?:review|evaluation)\s+(?:unit|sample|device)\s+(?:provided|supplied|loaned|gifted)\s+by\b/,
    /\b(?:review|test)\s+(?:unit|sample|produto)\s+(?:fornecido|cedido|enviado|presenteado)\s+por\b/,
    /\b(?:gifted|provided|supplied)\s+by\s+[\w.-]+\s+for\s+(?:this|our|the)\s+(?:review|article|story)\b/,
    /^\s*(?:press|news)\s+release\b/,
    /^\s*comunicado\s+de\s+imprensa\b/,
    /#(?:publi|ad)\b/
];

const PROMOTION_TERMS = [
    /\b(?:promocao|desconto|discount|cupom|coupon|codigo\s+promocional|promo\s+code|oferta\s+imperdivel|ofertas?\s+(?:do\s+dia|de\s+hoje)|deals?\s+roundup|daily\s+deals|on\s+sale|price\s+drop|lowest\s+price|all[- ]time\s+low)\b/,
    /\b(?:black\s+friday|prime\s+day|frete\s+gratis|limited[- ]time\s+offer|flash\s+sale|sale\s+(?:today|now)|save\s+(?:up\s+to\s+)?(?:[$€£]?\d+%?|\d+\s+percent))\b/
];

const CURRENCY_AMOUNT = /(?:\b(?:us\$|usd|r\$|brl)\s?\d[\d,.]*|[$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|brl|reais|euros|pounds)\b)/i;
const PRICE_PROMOTION_LANGUAGE = /\b(?:only|just|for\s+only|for\s+just|as\s+low\s+as|por\s+apenas|por\s+so|somente|custa\s+apenas|custa\s+so|a\s+preco\s+de\s+oferta|now\s+down\s+to|drops?\s+to|lowest\s+price|cheapest|best\s+value|bargain|steal)\b/i;
const REVERSE_PRICE_PROMOTION_LANGUAGE = /\b(?:only|just|a\s+steal|a\s+bargain|best\s+value|lowest\s+price)\b/i;

const DIRECT_CALLS_TO_BUY = [
    /\b(?:compre|comprar|garanta|adquira|assine|aproveite)\s+(?:agora|ja|o\s+seu|a\s+sua)\b/,
    /\b(?:buy|shop|order|subscribe)\s+(?:now|today)\b/,
    /\buse\s+(?:o\s+)?(?:cupom|codigo)\b/,
    /\b(?:start|claim)\s+your\s+(?:free\s+trial|discount)\b/,
    /\bsaiba\s+onde\s+comprar\b/
];

const PRODUCT_BUYING_GUIDE_PATTERNS = [
    /\b(?:melhor(?:es)?|top\s+\d+)\b.{0,140}\b(?:para\s+comprar|to\s+buy|buying\s+guide|guia\s+de\s+compras?)\b/,
    /\b(?:modelos?|produtos?|opcoes?|aparelhos?|dispositivos?)\b.{0,80}\b(?:para\s+comprar|to\s+buy)\b/,
    /\b(?:guia\s+de\s+compras?|guia\s+de\s+compra|shopping\s+guide|buying\s+guide|what\s+to\s+buy)\b/,
    /\b(?:qual|quais|which|what)\b.{0,60}\b(?:comprar|should\s+you\s+buy|to\s+buy)\b/,
    /\b(?:vale|valem)\s+a\s+pena\s+comprar\b/,
    /\b(?:best|top\s+\d+)\b.{0,100}\b(?:tvs?|televisions?|smartphones?|phones?|laptops?|notebooks?|tablets?|headphones?|monitors?|smartwatches?)\b.{0,60}\b(?:under\s+\$?\d+|for\s+every\s+budget|for\s+any\s+budget)\b/
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
    const sourceName = normalize(item.source_name || item.sourceName || item.source || '');
    const summary = normalize([
        item.description,
        item.summary,
        item.contentSnippet,
        item.content_snippet
    ].filter(Boolean).join(' '));
    const body = normalize(item.full_content || item['content:encoded'] || item.content || '');
    let metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    if (typeof item.metadata === 'string') {
        try {
            const parsedMetadata = JSON.parse(item.metadata);
            if (parsedMetadata && typeof parsedMetadata === 'object') metadata = parsedMetadata;
        } catch (error) {
            // Metadata livre continua sendo avaliada pelas demais regras de texto.
        }
    }
    const labels = normalize([
        item.categories,
        item.tags,
        item.category,
        item.ad_label,
        item.sponsorship,
        item.metadata,
        metadata.ad_label,
        metadata.sponsorship,
        metadata.content_type,
        metadata.tags
    ].filter(Boolean).map(toPlainText).join(' '));
    const link = normalize(item.original_link || item.originalUrl || item.canonicalUrl || item.link || '');

    const advertisingFlags = [
        item.isSponsored, item.is_sponsored, item.sponsored, item.isAdvertisement,
        item.advertisement, item.is_ad, item.isPaid, item.is_paid,
        item.paidContent, item.paid_content, metadata.isSponsored, metadata.is_sponsored,
        metadata.sponsored, metadata.isAdvertisement, metadata.advertisement, metadata.is_ad,
        metadata.isPaid, metadata.is_paid, metadata.paidContent, metadata.paid_content
    ];
    if (advertisingFlags.some(value => value === true || value === 1 || /^(?:true|yes|paid|sponsored|advertorial)$/i.test(String(value || '').trim()))) {
        return { isAdvertisement: true, reasons: ['advertising flag in feed metadata'] };
    }

    // Disclosure labels usually appear in the headline, feed labels, or the article's opening.
    const disclosureText = [title, summary, labels, body.slice(0, 1600)].join(' ');
    const disclosure = DISCLOSURE_PATTERNS.find(pattern => pattern.test(disclosureText));
    if (disclosure) {
        return { isAdvertisement: true, reasons: ['disclosure of sponsored or paid content'] };
    }

    const articleText = [title, summary, body].join(' ');
    if (/\b(?:affiliate\s+links?|(?:this\s+)?(?:article|post|story|page)\s+contains?\s+(?:some\s+)?affiliate\s+links?|may\s+earn\s+(?:a\s+)?commission|commission\s+(?:may\s+be\s+earned|when\s+you\s+(?:click|buy|purchase))|we\s+(?:may|might)\s+earn\s+(?:a\s+)?commission|links?\s+de\s+afiliados?|podemos\s+receber\s+(?:uma\s+)?comissao|ganhamos\s+comissao|podemos\s+ganhar\s+comissao|amazon\s+associate.{0,80}qualifying\s+purchases)\b/.test(articleText)) {
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

    if (PRODUCT_BUYING_GUIDE_PATTERNS.some(pattern => pattern.test(title))) {
        return { isAdvertisement: true, reasons: ['headline is a product buying guide or shopping recommendation'] };
    }

    // Reviews and shopping-style headlines often omit ad labels but foreground
    // an unusually low price (for example, "my ... monitor is only US$280").
    const headlineAndSummary = [title, summary].join(' ');
    if (CURRENCY_AMOUNT.test(headlineAndSummary) && PRICE_PROMOTION_LANGUAGE.test(headlineAndSummary)) {
        return { isAdvertisement: true, reasons: ['product headline emphasizes a low price or shopping value'] };
    }
    if (CURRENCY_AMOUNT.test(title) && REVERSE_PRICE_PROMOTION_LANGUAGE.test(title)) {
        return { isAdvertisement: true, reasons: ['product headline presents a price as a bargain or exceptional value'] };
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
