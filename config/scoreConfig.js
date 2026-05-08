module.exports = {
    version: '1.0.0',
    weights: {
        keyword: 1.0,
        source: 1.0,
        trend: 1.5,
        recency: 1.0,
        penalty: 1.0,
        impact: 1.2
    },
    keywords: {
        high: [
            'ia', 'inteligência artificial', 'openai', 'chatgpt', 'claude', 'gemini', 
            'agentes de ia', 'llm', 'machine learning', 'deep learning', 'anthropic'
        ],
        medium: [
            'automação', 'startups', 'big tech', 'programação', 'robótica', 
            'produtividade', 'saas', 'nuvem', 'cloud', 'devops', 'software'
        ]
    },
    penalties: {
        gossip: [
            'celebridade', 'fofoca', 'namoro', 'traição', 'polêmica', 'famosos', 
            'bbb', 'reality show', 'vazou', 'ator', 'atriz', 'cantor', 'briga'
        ],
        clickbait: [
            'você não vai acreditar', 'chocou a todos', 'veja o que aconteceu', 
            'o segredo revelado', 'isso vai te surpreender', 'descubra como'
        ]
    },
    impactTerms: [
        'mudança no mercado', 'substituir empregos', 'futuro do trabalho', 
        'tendência', 'grande lançamento', 'revolução', 'disrupção', 'demissão em massa',
        'substituído por ia', 'impacto global'
    ],
    sourceWeights: {
        'OpenAI Blog': 20,
        'TechCrunch': 15,
        'Hacker News': 15,
        'Wired': 10,
        'The Verge': 10,
        'Canaltech': 5,
        'Olhar Digital': 5
    }
};
