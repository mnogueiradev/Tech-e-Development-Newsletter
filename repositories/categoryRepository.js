const { classifyArticle } = require('../services/categoryClassifier');

class CategoryRepository {
    constructor(pool) {
        this.pool = pool;

        this.canonicalCategories = [
            {
                slug: 'ia',
                name: 'Inteligência Artificial',
                description: 'As notícias mais relevantes sobre inteligência artificial, modelos generativos, OpenAI, Anthropic, Google, agentes autônomos e infraestrutura de IA.',
                legacyKeys: ['ia', 'AI', 'ai', 'artificial intelligence', 'machine learning', 'inteligência artificial'],
                keywords: ['ia', 'ai', 'gpt', 'openai', 'anthropic', 'gemini', 'claude', 'llm', 'deepseek', 'copilot', 'inteligência artificial', 'machine learning', 'deep learning', 'agente', 'genai', 'hugging face', 'ollama', 'sora']
            },
            {
                slug: 'ciberseguranca',
                name: 'Cibersegurança',
                description: 'Cobertura completa sobre ataques cibernéticos, vazamentos de dados, ransomware, defesa corporativa, zero-day e regulamentação global.',
                legacyKeys: ['ciberseguranca', 'security', 'cybersecurity', 'segurança', 'infosec', 'hacker'],
                keywords: ['segurança', 'security', 'cyber', 'vazamento', 'ransomware', 'hacker', 'hack', 'vulnerabilidade', 'zero-day', 'phishing', 'malware', 'lgpd', 'firewall']
            },
            {
                slug: 'desenvolvimento',
                name: 'Desenvolvimento',
                description: 'Tendências em engenharia de software, novas linguagens, evolução de frameworks, arquitetura de sistemas, produtividade dev e tooling.',
                legacyKeys: ['desenvolvimento', 'web', 'programming', 'software engineering', 'frontend', 'backend'],
                keywords: ['desenvolvimento', 'dev', 'code', 'programação', 'framework', 'javascript', 'typescript', 'python', 'react', 'node', 'api', 'backend', 'frontend', 'git', 'rust', 'golang']
            },
            {
                slug: 'cloud',
                name: 'Cloud Computing',
                description: 'O universo da computação em nuvem: novidades da AWS, GCP, Azure, Oracle, além de Kubernetes, containers e arquitetura de alta disponibilidade.',
                legacyKeys: ['cloud', 'aws', 'gcp', 'azure', 'nuvem'],
                keywords: ['cloud', 'aws', 'gcp', 'azure', 'nuvem', 'kubernetes', 'k8s', 'container', 'serverless', 'lambda', 'terraform']
            },
            {
                slug: 'startups',
                name: 'Startups & Business',
                description: 'O mercado de tecnologia por dentro: rodadas de investimento (funding), aquisições, estratégias de crescimento SaaS e gestão de produto.',
                legacyKeys: ['startups', 'business', 'negócios', 'mercado', 'saas', 'funding', 'empreendedorismo'],
                keywords: ['startup', 'business', 'saas', 'funding', 'investimento', 'aporte', 'mercado', 'aquisição', 'unicórnio', 'venture capital']
            },
            {
                slug: 'hardware',
                name: 'Hardware & Infra',
                description: 'O silício que move a tecnologia. Cobertura de chips, GPUs de IA, evolução de CPUs, novos dispositivos e infraestrutura física de datacenters.',
                legacyKeys: ['hardware', 'chips', 'gpu', 'cpu', 'devices', 'apple', 'nvidia', 'intel'],
                keywords: ['hardware', 'chip', 'gpu', 'cpu', 'nvidia', 'intel', 'amd', 'apple', 'processador', 'datacenter', 'semicondutor', 'rtx', 'snapdragon']
            },
            {
                slug: 'mobile',
                name: 'Mobile',
                description: 'O ecossistema móvel: desenvolvimento Android e iOS, políticas de app stores, evolução de smartphones e novas formas de distribuição de software.',
                legacyKeys: ['mobile', 'android', 'ios', 'smartphone', 'apps'],
                keywords: ['mobile', 'android', 'ios', 'smartphone', 'app', 'iphone', 'google play', 'app store', 'flutter', 'react native', 'celular']
            },
            {
                slug: 'devops',
                name: 'DevOps & SRE',
                description: 'Práticas modernas de infraestrutura ágil: CI/CD, observabilidade, automação, Infrastructure as Code (IaC) e confiabilidade de sistemas (SRE).',
                legacyKeys: ['devops', 'sre', 'ci/cd', 'infraestrutura', 'observabilidade'],
                keywords: ['devops', 'sre', 'ci/cd', 'infraestrutura', 'observabilidade', 'docker', 'terraform', 'ansible', 'grafana', 'prometheus']
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

    getLegacyKeysForCategory(slug) {
        const cat = this.getCategoryBySlug(slug);
        return cat ? cat.legacyKeys : [slug];
    }

    buildWhereClause(slug) {
        const cat = this.getCategoryBySlug(slug);
        if (!cat) {
            return { sql: `WHERE n.status != 'rejeitada'`, params: [] };
        }

        // Se for slug 'ia', busca onde a categoria é 'ia' OU o título/descrição fala de IA
        const sql = `
            WHERE n.status != 'rejeitada'
              AND (
                LOWER(n.category) = ? 
                OR LOWER(n.category) LIKE ?
                OR LOWER(n.title) LIKE ? 
                OR LOWER(n.title) LIKE ?
                OR LOWER(n.title) LIKE ?
                OR LOWER(n.title) LIKE ?
              )
        `;

        const primaryKw = cat.keywords[0] || slug;
        const secondaryKw = cat.keywords[1] || slug;
        const tertiaryKw = cat.keywords[2] || slug;
        const quaternaryKw = cat.keywords[3] || slug;

        const params = [
            slug.toLowerCase(),
            `%${slug.toLowerCase()}%`,
            `%${primaryKw}%`,
            `%${secondaryKw}%`,
            `%${tertiaryKw}%`,
            `%${quaternaryKw}%`
        ];

        return { sql, params };
    }

    async getNewsByCategory(slug, page = 1, limit = 20, sort = 'score') {
        const offset = (page - 1) * limit;

        let orderBy = 'n.score DESC, n.publication_date DESC';
        if (sort === 'recent') {
            orderBy = 'n.publication_date DESC, n.score DESC';
        } else if (sort === 'featured') {
            orderBy = 'n.score DESC, n.id DESC';
        }

        try {
            // Tenta buscar por n.category = slug primeiro (notícias já reclassificadas)
            let countQuery = `SELECT COUNT(*) as total FROM news_v2 n WHERE n.status != 'rejeitada' AND LOWER(n.category) = ?`;
            let [[{ total: exactTotal }]] = await this.pool.query(countQuery, [slug.toLowerCase()]);

            let currentWhere = `WHERE n.status != 'rejeitada' AND LOWER(n.category) = ?`;
            let currentParams = [slug.toLowerCase()];
            let total = exactTotal;

            // Se ainda não houver notícias classificadas com a chave exata, busca com onde flexível por palavras-chave
            if (total === 0) {
                const { sql: flexWhere, params: flexParams } = this.buildWhereClause(slug);
                const [[{ total: flexTotal }]] = await this.pool.query(`SELECT COUNT(*) as total FROM news_v2 n ${flexWhere}`, flexParams);
                
                if (flexTotal > 0) {
                    total = flexTotal;
                    currentWhere = flexWhere;
                    currentParams = flexParams;
                } else {
                    // Fallback geral
                    const fallbackWhere = `WHERE n.status != 'rejeitada'`;
                    const [[{ total: fallbackTotal }]] = await this.pool.query(`SELECT COUNT(*) as total FROM news_v2 n ${fallbackWhere}`);
                    total = fallbackTotal;
                    currentWhere = fallbackWhere;
                    currentParams = [];
                }
            }

            const totalPages = Math.max(1, Math.ceil(total / limit));

            const dataQuery = `
                SELECT n.id, n.title, n.description, n.full_content as content, n.original_link, n.main_image, n.category, 
                       n.publication_date as published_at, s.name as source_name, n.score,
                       es.edition_date, DATE_FORMAT(es.edition_date, '%Y-%m-%d') as edition_slug
                 FROM news_v2 n
                 LEFT JOIN news_sources s ON n.source_id = s.id
                 LEFT JOIN edition_selections es ON es.news_id = n.id
                 ${currentWhere}
                 ORDER BY ${orderBy}
                 LIMIT ${Number(limit)} OFFSET ${Number(offset)}
            `;

            const [news] = await this.pool.query(dataQuery, currentParams);

            const formattedNews = news.map(item => {
                const words = ((item.title || '') + ' ' + (item.description || '') + ' ' + (item.content || '')).split(/\s+/).length;
                const readingTimeMin = Math.max(1, Math.ceil(words / 200));
                return {
                    ...item,
                    readingTime: `${readingTimeMin} min de leitura`,
                    categorySlug: slug
                };
            });

            return {
                data: formattedNews,
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

    async getSidebarData(slug) {
        try {
            // 1. Top 5 notícias da categoria
            const [topNews] = await this.pool.query(
                `SELECT n.id, n.title, n.original_link, n.score, n.publication_date as published_at, s.name as source_name
                 FROM news_v2 n
                 LEFT JOIN news_sources s ON n.source_id = s.id
                 WHERE n.status != 'rejeitada' AND (LOWER(n.category) = ? OR LOWER(n.title) LIKE ?)
                 ORDER BY n.score DESC
                 LIMIT 5`,
                [slug.toLowerCase(), `%${slug}%`]
            );

            let finalTopNews = topNews;
            if (finalTopNews.length === 0) {
                const [fallbackTop] = await this.pool.query(
                    `SELECT n.id, n.title, n.original_link, n.score, n.publication_date as published_at, s.name as source_name
                     FROM news_v2 n
                     LEFT JOIN news_sources s ON n.source_id = s.id
                     WHERE n.status != 'rejeitada'
                     ORDER BY n.score DESC
                     LIMIT 5`
                );
                finalTopNews = fallbackTop;
            }

            // 2. Edições recentes
            const [recentEditions] = await this.pool.query(
                `SELECT DISTINCT e.edition_date, e.slug, e.title
                 FROM editions e
                 ORDER BY e.edition_date DESC
                 LIMIT 4`
            );

            // 3. Categorias relacionadas
            const allCategoriesWithStats = await this.getCategoriesWithStats();
            const relatedCategories = allCategoriesWithStats.filter(c => c.slug !== slug).slice(0, 6);

            return {
                topWeeklyNews: finalTopNews,
                recentEditions,
                relatedCategories
            };
        } catch (error) {
            console.error('[CategoryRepository] Erro ao buscar dados da sidebar:', error);
            return { topWeeklyNews: [], recentEditions: [], relatedCategories: [] };
        }
    }

    async getCategoriesWithStats() {
        const result = [];
        
        for (const cat of this.canonicalCategories) {
            // 1. Tenta contar por n.category = slug
            const [rowsExact] = await this.pool.query(
                `SELECT COUNT(*) as count FROM news_v2 WHERE LOWER(category) = ? AND status != 'rejeitada'`,
                [cat.slug.toLowerCase()]
            );
            
            let count = rowsExact[0] ? rowsExact[0].count : 0;

            // 2. Se for 0, tenta flexível
            if (count === 0) {
                const { sql: flexWhere, params: flexParams } = this.buildWhereClause(cat.slug);
                const [rowsFlex] = await this.pool.query(
                    `SELECT COUNT(*) as count FROM news_v2 n ${flexWhere}`,
                    flexParams
                );
                count = rowsFlex[0] ? rowsFlex[0].count : 0;
            }
            
            result.push({
                slug: cat.slug,
                name: cat.name,
                description: cat.description,
                articleCount: count
            });
        }
        
        return result.sort((a, b) => b.articleCount - a.articleCount);
    }

    /**
     * Utilitário para reclassificar todas as notícias existentes no banco de dados
     * para as 8 categorias canônicas baseando-se em inteligência de conteúdo.
     */
    async reclassifyAllNewsInDB() {
        console.log('[RECLASSIFIER] 🧠 Iniciando reclassificação automática de notícias no banco...');
        try {
            const [allNews] = await this.pool.query(
                `SELECT id, title, description, category FROM news_v2 WHERE status != 'rejeitada'`
            );

            console.log(`[RECLASSIFIER] Encontradas ${allNews.length} notícias para reclassificar.`);

            let updatedCount = 0;
            const categoryDistribution = {};

            for (const news of allNews) {
                const newCategory = classifyArticle(news.title, news.description, [], 'desenvolvimento');
                
                categoryDistribution[newCategory] = (categoryDistribution[newCategory] || 0) + 1;

                if (news.category !== newCategory) {
                    await this.pool.query(
                        `UPDATE news_v2 SET category = ? WHERE id = ?`,
                        [newCategory, news.id]
                    );
                    updatedCount++;
                }
            }

            console.log(`[RECLASSIFIER] ✅ Reclassificação concluída! ${updatedCount} notícias atualizadas.`);
            console.log('[RECLASSIFIER] 📊 Distribuição final por categoria:', categoryDistribution);
            return { updatedCount, distribution: categoryDistribution };
        } catch (err) {
            console.error('[RECLASSIFIER] ❌ Erro ao reclassificar notícias:', err);
            throw err;
        }
    }
}

module.exports = CategoryRepository;
