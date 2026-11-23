const TECH_SIGNALS = [
    ['artificial intelligence', /\b(?:ia generativa|inteligencia artificial|artificial intelligence|machine learning|deep learning|aprendizado de maquina|modelo de linguagem|large language model|llm|generative ai|chatgpt|openai|anthropic|gemini|claude|deepseek|copilot)\b/],
    ['software and development', /\b(?:software|programacao|programming|linguagem de programacao|codigo fonte|open source|codigo aberto|framework|api|sistema operacional|linux|windows|android|ios|javascript|typescript|python|react|github|git|browser|navegador web)\b/],
    ['hardware and devices', /\b(?:hardware|chip|chips|processador|semicondutor|semicondutores|gpu|cpu|placa de video|computador|notebook|laptop|smartphone|celular|iphone|ipad|tablet|televisao inteligente|smart tv|oled|display|memoria ram|ssd)\b/],
    ['cybersecurity', /\b(?:ciberseguranca|cybersecurity|ransomware|malware|phishing|vazamento de dados|ataque cibernetico|vulnerabilidade|zero day|firewall|criptografia|protecao de dados)\b/],
    ['cloud and infrastructure', /\b(?:computacao em nuvem|cloud computing|cloud|nuvem|data center|datacenter|servidor|kubernetes|docker|serverless|infraestrutura digital|banco de dados)\b/],
    ['internet and telecom', /\b(?:5g|6g|wifi|wi fi|fibra optica|banda larga|telecomunicacoes|telecom|internet das coisas|internet|iot|roteador|rede movel|satellite internet)\b/],
    ['digital products and platforms', /\b(?:aplicativo|aplicativos|app store|loja de aplicativos|rede social|plataforma digital|servico digital|motor de busca|buscador|streaming|algoritmo|marketplace digital|comercio eletronico|e commerce|pagamento digital)\b/],
    ['gaming technology', /\b(?:videogame|video game|jogo eletronico|jogos eletronicos|gaming|console|playstation|xbox|nintendo switch|steam deck|placa grafica|game engine|game development|game publisher|game developer|games industry|motor grafico|estudio de jogos|desenvolvedora de jogos)\b/],
    ['technology business', /\b(?:startups?|saas|fintech|edtech|healthtech|cleantech|govtech|proptech|venture capital|funding|fundraising|unicornio|unicorn)\b/],
    ['science and emerging technology', /\b(?:robotica|robo autonomo|robotica|computacao quantica|quantum computing|impressao 3d|biotecnologia|satellite|satelite|tecnologia espacial|carro eletrico|veiculo eletrico|carro autonomo|direcao autonoma|bateria de litio)\b/],
    ['technology companies', /\b(?:google|microsoft|apple|nvidia|intel|amd|qualcomm|samsung|lg|meta|amazon|huawei|tesla|byd|openai|anthropic|xai|deepseek|tiktok|oracle|ibm|adobe|cisco|salesforce|xiaomi|sony)\b/],
    ['technology topic', /\b(?:tecnologia|tecnologico|tecnologica|digitalizacao|transformacao digital|inovacao tecnologica|produto digital)\b/]
];

const SPORTS_TERMS = /\b(?:futebol|soccer|football|brasileirao|copa do brasil|libertadores|champions league|premier league|liga dos campeoes|nba|nfl|formula 1|formula one|f1|tenis|tennis|volei|volleyball|basquete|basketball|baseball|sports?|esportes?|olimpiadas|olympics?|paralimpiadas|campeonato|torneio|partida|rodada|escalacoes|placar|gols?|super bowl|world cup)\b/;
const SPORTS_FORMAT = /\b(?:onde assistir|where to watch|horario|kick[ -]?off|escalacoes|lineups?|placar|live score|resultado|ao vivo|partida|rodada|fixture|match schedule|matchday|standings|tabela do campeonato|proxima rodada|transmissao de hoje|game tonight)\b|\b[a-z]{3,}\s+(?:x|vs\.?|contra)\s+[a-z]{3,}\b/;
const COMPANY_NEWS_ACTION = /\b(?:lanca|lancou|lancara|anuncia|anunciou|apresenta|apresentou|revela|revelou|atualiza|atualizou|desenvolve|desenvolveu|compra|comprou|adquire|adquiriu|investe|investiu|descontinua|descontinuou|libera|liberou|expande|expandiu|integra|integrou|demite|demitiu|contrata|contratou|processa|processou|fecha|fechou|abre|abriu|bloqueia|bloqueou|remove|removeu|enfrenta|enfrentou|perde|perdeu|ganha|ganhou|confirma|confirmou|nega|negou|planeja|planejou|suspende|suspendeu|multa|multou|introduz|introduziu|cria|criou|testa|testou|adiciona|adicionou|retira|retirou|inclui|incluiu|aumenta|aumentou|reduz|reduziu|corta|cortou|processo|processada|processado|receita|faturamento|acoes|antitruste|regulador|regulacao|launch(?:es|ed)?|announc(?:es|ed)|unveil(?:s|ed)|reveal(?:s|ed)|updates?|develops?|releases?|introduc(?:es|ed)|adds?|starts?|tests?|builds?|creates?|buys|acquires?|invests?|cuts?|hires?|fires?|faces|sues?|settles?|confirms?|denies?|plans?|expands?|opens?|closes?|shuts?\s+down|rolls\s+out|mulls|considers|lawsuit|antitrust|revenue|earnings|shares|stock|fined|regulator|regulation|banned|ban|reports?)\b/;

function flatten(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ');
    if (typeof value === 'object') return Object.values(value).map(flatten).filter(Boolean).join(' ');

    const raw = String(value).trim();
    if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
        try { return flatten(JSON.parse(raw)); } catch { /* keep plain text */ }
    }
    return raw;
}

function normalize(value) {
    return flatten(value)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;|&#34;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => {
            const codePoint = value[0].toLowerCase() === 'x'
                ? parseInt(value.slice(1), 16)
                : Number(value);
            return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
                ? String.fromCodePoint(codePoint)
                : ' ';
        })
        .replace(/&aacute;/gi, 'á')
        .replace(/&atilde;/gi, 'ã')
        .replace(/&acirc;/gi, 'â')
        .replace(/&eacute;/gi, 'é')
        .replace(/&ecirc;/gi, 'ê')
        .replace(/&iacute;/gi, 'í')
        .replace(/&oacute;/gi, 'ó')
        .replace(/&otilde;/gi, 'õ')
        .replace(/&ocirc;/gi, 'ô')
        .replace(/&uacute;/gi, 'ú')
        .replace(/&ccedil;/gi, 'ç')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function classifyTechnologyNews(item = {}) {
    const title = normalize(item.title);
    const description = normalize([item.description, item.summary, item.contentSnippet, item.content_snippet].filter(Boolean).join(' '));
    const tags = normalize([item.tags, item.categories].filter(Boolean));
    const body = normalize(item.full_content || item['content:encoded'] || item.content || '').slice(0, 5000);
    const searchableText = [title, description, tags, body].filter(Boolean).join(' ');
    const titleSignals = TECH_SIGNALS.filter(([, pattern]) => pattern.test(title)).map(([name]) => name);
    const allSignals = TECH_SIGNALS.filter(([, pattern]) => pattern.test(searchableText)).map(([name]) => name);
    const hasExplicitTechnologyInTitle = titleSignals.some(signal => signal !== 'technology companies');
    const companySignal = titleSignals.includes('technology companies') && COMPANY_NEWS_ACTION.test(title);
    const hasTechEvidence = hasExplicitTechnologyInTitle || companySignal || allSignals.some(signal => signal !== 'technology companies');
    const sportsSubject = SPORTS_TERMS.test(`${title} ${tags}`);

    // Sports coverage is excluded by subject, unless the headline itself is about a technology.
    // This allows technology stories about sports while rejecting fixtures, scores and schedules.
    if (sportsSubject && !hasExplicitTechnologyInTitle) {
        return {
            isTechnologyNews: false,
            reason: SPORTS_FORMAT.test(title) ? 'sports schedule or result' : 'sports subject without a technology focus',
            signals: allSignals
        };
    }

    if (!hasTechEvidence) {
        return { isTechnologyNews: false, reason: 'no clear technology topic found', signals: allSignals };
    }

    return { isTechnologyNews: true, reason: null, signals: allSignals };
}

function isTechnologyNews(item = {}) {
    return classifyTechnologyNews(item).isTechnologyNews;
}

module.exports = { classifyTechnologyNews, isTechnologyNews };
