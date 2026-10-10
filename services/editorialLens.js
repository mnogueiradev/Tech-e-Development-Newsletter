const EDITORIAL_SIGNALS = [
    {
        pattern: /\b(vazamento|breach|ransomware|malware|phishing|vulnerabilidade|exploit|ataque|invasao|data leak|security flaw|zero[- ]day|indisponibilidade|downtime|outage|queda de servico)\b/,
        editorialLabel: 'Risco & resposta',
        whyItMatters: 'Falhas e incidentes podem expor dados ou interromper serviços que dependem do produto afetado.',
        nextStep: 'Verifique se sua equipe usa o serviço citado e siga as orientações oficiais de mitigação.'
    },
    {
        pattern: /\b(lei|regulacao|regulamento|regulatory|compliance|lgpd|marco legal|regulation|legislation)\b/,
        editorialLabel: 'Regra & impacto',
        whyItMatters: 'Mudanças regulatórias podem alterar obrigações sobre dados, produtos e operações.',
        nextStep: 'Confira o texto e a data de vigência; depois, mapeie quais dados ou processos da sua organização entram no escopo.'
    },
    {
        pattern: /\b(benchmark|benchmarks|estudo|estudos|pesquisa|pesquisas|paper|research|study|studies)\b/,
        editorialLabel: 'Da pesquisa à prática',
        whyItMatters: 'Resultados de estudos e benchmarks dependem do método, das métricas e das condições usadas.',
        nextStep: 'Leia a metodologia e compare os resultados com o workload que realmente importa para você.'
    },
    {
        pattern: /\b(aporte|funding|aquisicao|acquisition|demissoes|layoffs|valuation|ipo|receita|revenue|faturamento)\b/,
        editorialLabel: 'Sinal de mercado',
        whyItMatters: 'Movimentos de capital e aquisições mostram onde o mercado está apostando e podem mudar o cenário de fornecedores e concorrentes.',
        nextStep: 'Observe se o movimento altera produto, preço ou suporte das ferramentas e empresas que você acompanha.'
    }
];

const AI_TOPIC_SIGNALS = [
    {
        pattern: /\b(agentes?|agents?|agentic|autonom\w*|orquestr\w*|automation|automacao|fluxo[s]? de trabalho)\b/,
        editorialLabel: 'Agentes & automação',
        whyItMatters: 'Agentes mudam quais etapas podem rodar sem intervenção — e quais permissões precisam ser controladas.',
        nextStep: 'Teste com um objetivo delimitado, permissões mínimas e aprovação humana antes de liberar ações externas.'
    },
    {
        pattern: /\b(coding|\bcode\b|programa\w*|desenvolvedor\w*|software engineer|copilot|cursor|codex|ide|debug\w*|depur\w*|vibe coding)\b/,
        editorialLabel: 'IA no código',
        whyItMatters: 'Assistentes de programação podem acelerar tarefas, mas também introduzir bugs, dependências e código inseguro.',
        nextStep: 'Use em uma tarefa pequena, revise o diff e rode testes e verificações de segurança antes de integrar.'
    },
    {
        pattern: /\b(privacidade|privacy|dados pessoais|personal data|safety|seguranca|security|guardrails?|alucinacao|hallucination|vies|bias|deepfake|copyright|direitos autorais|jailbreak|confiabilidade)\b/,
        editorialLabel: 'Segurança & confiança',
        whyItMatters: 'O uso de IA depende de como os dados são tratados e de quão confiáveis são as respostas no caso concreto.',
        nextStep: 'Confira retenção e uso dos dados; valide respostas e mantenha revisão humana em decisões ou fluxos críticos.'
    },
    {
        pattern: /\b(open source|open[- ]weight\w*|codigo aberto|pesos abertos|self.hosted|hospedagem propria|modelo aberto)\b/,
        editorialLabel: 'Modelos abertos',
        whyItMatters: 'Pesos abertos ampliam controle e hospedagem própria, mas transferem parte da operação para sua equipe.',
        nextStep: 'Confira a licença, a memória/GPU necessária e o custo de servir o modelo antes de planejar uma implantação.'
    },
    {
        pattern: /\b(video|imagem|audio|voz|multimodal|geracao de midia|generative media|sintese de voz|text.to.video|text.to.image)\b/,
        editorialLabel: 'IA generativa & mídia',
        whyItMatters: 'Geração de mídia pode mudar processos criativos, mas envolve direitos de uso, consentimento e identificação do conteúdo.',
        nextStep: 'Teste com um caso concreto e confira licença, origem dos dados e regras de divulgação do material gerado.'
    },
    {
        pattern: /\b(preco|pricing|custo|cost|token\w*|api|rate limit\w*|limite de uso|faturamento|billing)\b/,
        editorialLabel: 'Custo & escala',
        whyItMatters: 'Preço por uso e limites determinam se uma experiência com IA continua viável quando o volume cresce.',
        nextStep: 'Estime volume, tokens, latência e quotas com dados reais antes de ampliar a integração.'
    },
    {
        pattern: /\b(gpu\w*|nvidia|chip\w*|datacenter\w*|data center\w*|comput\w*|treinamento|training|inferencia|energia|energy|memoria|memory)\b/,
        editorialLabel: 'Infraestrutura de IA',
        whyItMatters: 'Capacidade de processamento influencia custo, velocidade e disponibilidade dos modelos.',
        nextStep: 'Compare custo por tarefa e capacidade para o seu volume, não apenas o pico de desempenho anunciado.'
    },
    {
        pattern: /\b(empresa\w*|enterprise|workplace|trabalho|produtividade|equipe\w*|colaboradores|corporativo)\b/,
        editorialLabel: 'IA no trabalho',
        whyItMatters: 'A adoção por equipes depende de integração, governança e proteção dos dados usados no trabalho.',
        nextStep: 'Faça um piloto com uma equipe e valide permissões, retenção de dados e revisão dos resultados antes de ampliar.'
    },
    {
        pattern: /\b(modelo\w*|model\w*|llm\w*|gpt(?:[- ]?\d+(?:\.\d+)?)?|claude|gemini|llama|mistral|deepseek|qwen|grok|phi[- ]?\d+)\b/,
        editorialLabel: 'Modelos & avaliação',
        whyItMatters: 'Novos modelos podem mudar qualidade, velocidade e custo nas tarefas em que você já usa IA.',
        nextStep: 'Compare o modelo citado com sua opção atual nas mesmas tarefas, critérios e limites antes de trocar.'
    }
];

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

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function getCategory(item) {
    const categoryKey = normalize(item.category).replace(/[\s&-]+/g, '');
    return CATEGORY_ALIASES[categoryKey] || categoryKey;
}

function getReleaseLens(category) {
    const byCategory = {
        ia: {
            editorialLabel: 'Adoção com critério',
            whyItMatters: 'Um recurso anunciado pode ainda não estar disponível, ser compatível ou fazer sentido para o seu caso.',
            nextStep: 'Confira disponibilidade, preço, requisitos e limites; depois, teste em um ambiente de baixo risco.'
        },
        cloud: {
            editorialLabel: 'Nuvem & operação',
            whyItMatters: 'Um serviço novo pode variar por região, arquitetura, preço e nível de disponibilidade.',
            nextStep: 'Confira região, limites, preço total e SLA antes de incluir o serviço na arquitetura.'
        },
        desenvolvimento: {
            editorialLabel: 'Mudança na stack',
            whyItMatters: 'Uma atualização pode afetar compatibilidade, manutenção e o fluxo de desenvolvimento.',
            nextStep: 'Leia as notas de versão e teste a migração em uma branch antes de atualizar projetos ativos.'
        },
        mobile: {
            editorialLabel: 'Compatibilidade mobile',
            whyItMatters: 'Novidades de plataforma podem depender da versão do sistema e dos dispositivos disponíveis.',
            nextStep: 'Confira versões e aparelhos compatíveis e teste a experiência antes de adaptar seu aplicativo.'
        }
    };
    return byCategory[category] || {
        editorialLabel: 'Disponibilidade & uso',
        whyItMatters: 'Um anúncio não significa que o recurso já está disponível ou adequado ao seu cenário.',
        nextStep: 'Confirme disponibilidade, requisitos, preço e limitações na fonte original antes de decidir.'
    };
}

function getEditorialLens(item = {}) {
    const context = normalize([item.title, item.description].filter(Boolean).join(' '));
    const category = getCategory(item);

    const sharedSignal = EDITORIAL_SIGNALS.find((signal) => signal.pattern.test(context));
    if (sharedSignal) return sharedSignal;

    if (category === 'ia') {
        const aiSignal = AI_TOPIC_SIGNALS.find((signal) => signal.pattern.test(context));
        if (aiSignal) return aiSignal;
    }

    const releaseSignal = /\b(lanca\w*|lancamento|anuncia\w*|apresenta\w*|revela\w*|introduz\w*|adiciona\w*|libera\w*|chega|introduces|launches|launch|release|available|availability|preview|beta|update\w*)\b/.test(context);
    if (releaseSignal) return getReleaseLens(category);

    if (category === 'cloud' && /\b(aws|azure|gcp|kubernetes|k8s|docker|container\w*|serverless|nuvem|cloud)\b/.test(context)) {
        return {
            editorialLabel: 'Arquitetura & custo',
            whyItMatters: 'A escolha de serviços de nuvem afeta custo recorrente, portabilidade e operação da arquitetura.',
            nextStep: 'Compare limites, região, dependências e custo total no seu volume antes de migrar.'
        };
    }

    if (category === 'devops' && /\b(deploy\w*|pipeline\w*|observabilidade|observability|monitoramento|monitoring|ci\/cd|sre|rollback|incident\w*)\b/.test(context)) {
        return {
            editorialLabel: 'Entrega & confiabilidade',
            whyItMatters: 'Mudanças de operação afetam a velocidade de entrega e a capacidade de detectar falhas.',
            nextStep: 'Valide em homologação, monitore os indicadores e mantenha uma forma clara de reverter.'
        };
    }

    if (category === 'hardware' && /\b(gpu\w*|chip\w*|cpu\w*|processador\w*|semicondutor\w*|nvidia|amd|intel|tsmc)\b/.test(context)) {
        return {
            editorialLabel: 'Desempenho & custo',
            whyItMatters: 'Novos componentes podem alterar desempenho, consumo e custo por tarefa.',
            nextStep: 'Procure benchmarks independentes para o seu uso e compare o custo total antes de considerar uma troca.'
        };
    }

    if (category === 'mobile' && /\b(android|ios|iphone|smartphone\w*|app store|google play|aplicativo\w*|mobile)\b/.test(context)) {
        return {
            editorialLabel: 'Compatibilidade mobile',
            whyItMatters: 'Mudanças em plataformas móveis podem afetar compatibilidade, distribuição e experiência do usuário.',
            nextStep: 'Confira versões, dispositivos e APIs envolvidos antes de adaptar ou publicar seu aplicativo.'
        };
    }

    if (category === 'desenvolvimento' && /\b(framework\w*|javascript|typescript|python|rust|golang|api\w*|database\w*|banco de dados|open source|codigo aberto|github|git)\b/.test(context)) {
        return {
            editorialLabel: 'Stack & manutenção',
            whyItMatters: 'Mudanças em ferramentas e padrões podem afetar compatibilidade, segurança e manutenção do código.',
            nextStep: 'Confira versão, licença e impacto nas dependências; experimente em uma branch antes de adotar.'
        };
    }

    return null;
}

module.exports = { getEditorialLens };
