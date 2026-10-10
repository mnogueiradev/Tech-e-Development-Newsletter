const SIGNALS = [
    {
        pattern: /\b(vazamento|breach|ransomware|malware|phishing|vulnerabilidade|exploit|ataque|invasao|data leak|security flaw|zero[- ]day)\b/,
        label: 'Risco & resposta',
        whyItMatters: 'Falhas e incidentes podem expor dados ou interromper serviços que dependem do produto afetado.',
        nextStep: 'Verifique se sua equipe usa o serviço citado e siga as orientações oficiais de mitigação.'
    },
    {
        pattern: /\b(lei|regulacao|regulamento|regulatory|compliance|lgpd|marco legal|regulation|legislation)\b/,
        label: 'Regra & impacto',
        whyItMatters: 'Mudanças regulatórias podem alterar obrigações sobre dados, produtos e operações.',
        nextStep: 'Confira o texto e a data de vigência; depois, mapeie quais dados ou processos da sua organização entram no escopo.'
    },
    {
        pattern: /\b(benchmark|benchmarks|estudo|estudos|pesquisa|pesquisas|paper|research|study|studies)\b/,
        label: 'Da pesquisa à prática',
        whyItMatters: 'Resultados de estudos e benchmarks dependem do método, das métricas e das condições usadas.',
        nextStep: 'Leia a metodologia e compare os resultados com o workload que realmente importa para você.'
    },
    {
        pattern: /\b(aporte|funding|aquisicao|acquisition|demissoes|layoffs|valuation|ipo|receita|revenue|faturamento)\b/,
        label: 'Sinal de mercado',
        whyItMatters: 'Movimentos de capital e aquisições mostram onde o mercado está apostando e podem mudar o cenário de fornecedores e concorrentes.',
        nextStep: 'Observe se o movimento altera produto, preço ou suporte das ferramentas e empresas que você acompanha.'
    },
    {
        pattern: /\b(lanca|lancamento|anuncia|anuncio|introduces|launches|launch|release|disponivel|availability|preview|beta)\b/,
        label: 'Adoção com critério',
        whyItMatters: 'Um recurso anunciado pode ainda não estar disponível, ser compatível ou fazer sentido para o seu caso.',
        nextStep: 'Confira disponibilidade, preço, requisitos e limites; depois, teste em um ambiente de baixo risco.'
    }
];

const CATEGORY_LENSES = {
    ia: {
        label: 'IA com critério',
        whyItMatters: 'Em IA, o impacto real depende de qualidade, custo e tratamento dos dados — não só da demonstração.',
        nextStep: 'Experimente em uma tarefa de baixo risco e compare tempo, custo e qualidade com seu fluxo atual.'
    },
    ciberseguranca: {
        label: 'Ponto de atenção',
        whyItMatters: 'O tema pode afetar a exposição de contas, dados ou sistemas usados no dia a dia.',
        nextStep: 'Cheque se o produto ou serviço citado está no seu ambiente e acompanhe as recomendações oficiais.'
    },
    cloud: {
        label: 'Infraestrutura',
        whyItMatters: 'Mudanças de nuvem podem afetar custo, disponibilidade e dependências da sua arquitetura.',
        nextStep: 'Compare limites, regiões e preço total; valide compatibilidade antes de alterar algo em produção.'
    },
    startups: {
        label: 'Sinal de mercado',
        whyItMatters: 'Lançamentos e movimentos de empresas ajudam a entender prioridades, concorrência e maturidade do mercado.',
        nextStep: 'Observe se isso muda as opções para seus clientes, sua equipe ou as ferramentas que você usa.'
    },
    hardware: {
        label: 'Desempenho & custo',
        whyItMatters: 'Mudanças em chips e equipamentos podem alterar desempenho, preço e disponibilidade de capacidade.',
        nextStep: 'Procure benchmarks independentes para o seu uso e compare o custo total antes de considerar uma troca.'
    },
    mobile: {
        label: 'Compatibilidade',
        whyItMatters: 'Mudanças em plataformas móveis podem afetar compatibilidade, distribuição e experiência do usuário.',
        nextStep: 'Confira versões, dispositivos e APIs envolvidos antes de adaptar ou publicar seu aplicativo.'
    },
    devops: {
        label: 'Operação & confiabilidade',
        whyItMatters: 'Novidades de operação podem mudar a forma de entregar, observar e manter serviços confiáveis.',
        nextStep: 'Valide em homologação, monitore o comportamento e prepare uma reversão antes de levar para produção.'
    },
    desenvolvimento: {
        label: 'Stack & produtividade',
        whyItMatters: 'Mudanças em linguagens, frameworks e ferramentas afetam produtividade, compatibilidade e manutenção.',
        nextStep: 'Leia as notas de versão, confira licenças e migrações e experimente em uma branch antes de adotar.'
    }
};

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

const CATEGORY_ALIASES = {
    ai: 'ia',
    artificialintelligence: 'ia',
    inteligenciaartificial: 'ia',
    security: 'ciberseguranca',
    cybersecurity: 'ciberseguranca',
    cloudcomputing: 'cloud',
    business: 'startups',
    infrastructure: 'devops',
    infraestrutura: 'devops',
    development: 'desenvolvimento',
    programming: 'desenvolvimento',
    softwareengineering: 'desenvolvimento'
};

function getEditorialLens(item = {}) {
    const context = normalize([item.title, item.description].filter(Boolean).join(' '));
    const signal = SIGNALS.find((entry) => entry.pattern.test(context));
    if (signal) {
        return {
            editorialLabel: signal.label,
            whyItMatters: signal.whyItMatters,
            nextStep: signal.nextStep
        };
    }

    const categoryKey = normalize(item.category).replace(/[\s&-]+/g, '');
    const category = CATEGORY_ALIASES[categoryKey] || categoryKey;
    const lens = CATEGORY_LENSES[category] || {
        label: 'Contexto prático',
        whyItMatters: 'A relevância depende do que realmente muda em custo, capacidade, segurança ou acesso.',
        nextStep: 'Abra a fonte original e confira disponibilidade, limitações e datas antes de decidir o que fazer.'
    };

    return {
        editorialLabel: lens.label,
        whyItMatters: lens.whyItMatters,
        nextStep: lens.nextStep
    };
}

module.exports = { getEditorialLens };
