class CategoryRepository {
    constructor(pool) {
        this.pool = pool;

        this.canonicalCategories = [
            {
                slug: 'ia',
                name: 'Inteligência Artificial',
                description: 'As notícias mais relevantes sobre inteligência artificial, modelos generativos, OpenAI, Anthropic, Google, agentes autônomos e infraestrutura de IA.',
                legacyKeys: ['ia', 'AI', 'ai', 'artificial intelligence', 'machine learning', 'inteligência artificial']
            },
            {
                slug: 'ciberseguranca',
                name: 'Cibersegurança',
                description: 'Cobertura completa sobre ataques cibernéticos, vazamentos de dados, ransomware, defesa corporativa, zero-day e regulamentação global.',
                legacyKeys: ['ciberseguranca', 'security', 'cybersecurity', 'segurança', 'infosec', 'hacker']
            },
            {
                slug: 'desenvolvimento',
                name: 'Desenvolvimento',
                description: 'Tendências em engenharia de software, novas linguagens, evolução de frameworks, arquitetura de sistemas, produtividade dev e tooling.',
                legacyKeys: ['desenvolvimento', 'web', 'tecnologia', 'programming', 'software engineering', 'frontend', 'backend']
            },
            {
                slug: 'cloud',
                name: 'Cloud Computing',
                description: 'O universo da computação em nuvem: novidades da AWS, GCP, Azure, Oracle, além de Kubernetes, containers e arquitetura de alta disponibilidade.',
                legacyKeys: ['cloud', 'aws', 'gcp', 'azure', 'nuvem']
            },
            {
                slug: 'startups',
                name: 'Startups & Business',
                description: 'O mercado de tecnologia por dentro: rodadas de investimento (funding), aquisições, estratégias de crescimento SaaS e gestão de produto.',
                legacyKeys: ['startups', 'business', 'negócios', 'mercado', 'saas', 'funding', 'empreendedorismo']
            },
            {
                slug: 'hardware',
                name: 'Hardware & Infra',
                description: 'O silício que move a tecnologia. Cobertura de chips, GPUs de IA, evolução de CPUs, novos dispositivos e infraestrutura física de datacenters.',
                legacyKeys: ['hardware', 'chips', 'gpu', 'cpu', 'devices', 'apple', 'nvidia', 'intel']
            },
            {
                slug: 'mobile',
                name: 'Mobile',
                description: 'O ecossistema móvel: desenvolvimento Android e iOS, políticas de app stores, evolução de smartphones e novas formas de distribuição de software.',
                legacyKeys: ['mobile', 'android', 'ios', 'smartphone', 'apps']
            },
            {
                slug: 'devops',
                name: 'DevOps & SRE',
                description: 'Práticas modernas de infraestrutura ágil: CI/CD, observabilidade, automação, Infrastructure as Code (IaC) e confiabilidade de sistemas (SRE).',
                legacyKeys: ['devops', 'sre', 'ci/cd', 'infraestrutura', 'observabilidade']
            }
        ];
    }

    getCategoryBySlug(slug) {
        return this.canonicalCategories.find(c => c.slug === slug);
    }

    getAllCategories() {
        return this.canonicalCategories.map(c => ({
            slug: c.slug,
            name: c.name,
            description: c.description
        }));
    }

    // Retorna as chaves legadas para montar o IN (...) ou as clausulas OR do SQL
    getLegacyKeysForCategory(slug) {
        const cat = this.getCategoryBySlug(slug);
        return cat ? cat.legacyKeys : [slug];
    }

    async getNewsByCategory(slug, page = 1, limit = 20) {
        const legacyKeys = this.getLegacyKeysForCategory(slug);
        const offset = (page - 1) * limit;

        // Monta os placeholders dinamicamente (?, ?, ?)
        const placeholders = legacyKeys.map(() => '?').join(',');

        // 1. Contar o total de notícias válidas
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM news_v2 
            WHERE category IN (${placeholders}) 
              AND full_content IS NOT NULL
              AND language = 'pt-BR'
              AND status != 'rejeitada'
        `;
        
        // 2. Buscar as notícias
        const dataQuery = `
            SELECT n.id, n.title, n.description, n.full_content as content, n.original_link, n.main_image, n.category, 
                   n.publication_date as published_at, s.name as source_name, n.score
            FROM news_v2 n
            LEFT JOIN news_sources s ON n.source_id = s.id
            WHERE n.category IN (${placeholders})
              AND n.full_content IS NOT NULL
              AND n.language = 'pt-BR'
              AND n.status != 'rejeitada'
            ORDER BY n.score DESC, n.publication_date DESC
            LIMIT ? OFFSET ?
        `;

        try {
            const [[{ total }]] = await this.pool.execute(countQuery, legacyKeys);
            const totalPages = Math.ceil(total / limit);

            // MySQL exige que limit e offset sejam inteiros e muitas vezes não gosta deles num array sem conversão
            // Mas mysql2/promise gerencia bem se passarmos as strings ou nums, 
            // contudo para segurança extra formatamos como número no JS ou deixamos o driver cuidar
            const queryParams = [...legacyKeys, limit.toString(), offset.toString()];
            
            // Usamos query no lugar de execute quando temos paginação com cast de params
            const [news] = await this.pool.query(
                `SELECT n.id, n.title, n.description, n.full_content as content, n.original_link, n.main_image, n.category, 
                   n.publication_date as published_at, s.name as source_name, n.score
                 FROM news_v2 n
                 LEFT JOIN news_sources s ON n.source_id = s.id
                 WHERE n.category IN (${placeholders})
                   AND n.full_content IS NOT NULL
                   AND n.language = 'pt-BR'
                   AND n.status != 'rejeitada'
                 ORDER BY n.score DESC, n.publication_date DESC
                 LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, 
                legacyKeys
            );

            return {
                data: news,
                pagination: {
                    total,
                    totalPages,
                    currentPage: Number(page),
                    limit: Number(limit)
                }
            };
        } catch (error) {
            console.error('[CategoryRepository] Erro ao buscar notícias da categoria:', error);
            throw error;
        }
    }
    
    async getCategoriesWithStats() {
        // Para a listagem de categorias, podemos querer saber o total de notícias em cada uma
        const result = [];
        
        for (const cat of this.canonicalCategories) {
            const placeholders = cat.legacyKeys.map(() => '?').join(',');
            const [rows] = await this.pool.query(
                `SELECT COUNT(*) as count FROM news_v2 WHERE category IN (${placeholders}) AND language = 'pt-BR' AND status != 'rejeitada'`,
                cat.legacyKeys
            );
            
            result.push({
                slug: cat.slug,
                name: cat.name,
                description: cat.description,
                articleCount: rows[0].count
            });
        }
        
        // Ordena por maior número de artigos
        return result.sort((a, b) => b.articleCount - a.articleCount);
    }
}

module.exports = CategoryRepository;
