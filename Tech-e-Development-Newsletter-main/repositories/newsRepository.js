class NewsRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async findByLinkOrHash(link, hash) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT id FROM news_v2 WHERE original_link = ? OR content_hash = ?',
                [link, hash || null] // If hash is undefined, fallback to null
            );
            return rows.length > 0;
        } catch (error) {
            console.error('[NewsRepo] Erro ao buscar por link ou hash:', error);
            throw error;
        }
    }

    async create(newsData) {
        try {
            await this.pool.execute(
                `INSERT INTO news_v2 (
                    source_id, title, slug, description, full_content, original_link,
                    category, tags, main_image, author, language, publication_date,
                    status, score, content_hash, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newsData.source_id,
                    newsData.title,
                    newsData.slug || null,
                    newsData.description || null,
                    newsData.full_content || null,
                    newsData.original_link,
                    newsData.category || 'geral',
                    newsData.tags ? JSON.stringify(newsData.tags) : null,
                    newsData.main_image || null,
                    newsData.author || null,
                    newsData.language || 'pt-BR',
                    newsData.publication_date ? new Date(newsData.publication_date) : new Date(),
                    newsData.status || 'coletada',
                    newsData.score || 0,
                    newsData.content_hash || null,
                    newsData.metadata ? JSON.stringify(newsData.metadata) : null
                ]
            );
            return true;
        } catch (error) {
            console.error(`[NewsRepo] Erro ao inserir notícia (${newsData.title}):`, error.message);
            throw error;
        }
    }

    /**
     * Busca notícias das últimas 24h para usar no cálculo de relevância / tendências
     */
    async getRecentNewsForComparison() {
        try {
            const [rows] = await this.pool.execute(
                `SELECT id, title, original_link FROM news_v2 
                 WHERE publication_date >= NOW() - INTERVAL 24 HOUR`
            );
            return rows;
        } catch (error) {
            console.error('[NewsRepo] Erro ao buscar notícias recentes:', error);
            return [];
        }
    }

    /**
     * Retorna o ranking das notícias mais relevantes do dia, ordenadas pelo score
     * @param {number} limit Quantidade de notícias a retornar
     */
    async getTopNews(limit = 10) {
        try {
            console.log(`[NewsRepo] Buscando Top News. Limite: ${limit}`);
            const limitNum = Number(limit);
            if (isNaN(limitNum) || limitNum <= 0) {
                console.warn(`[NewsRepo] Limite inválido: ${limit}. Usando padrão 10.`);
                limit = 10;
            }
            const [rows] = await this.pool.execute(
                `SELECT n.id, n.title, n.description, s.name as source_name, n.original_link, n.score, 
                        n.publication_date, n.status, n.tags, n.category, n.main_image, n.author
                 FROM news_v2 n
                 LEFT JOIN news_sources s ON n.source_id = s.id
                 WHERE n.publication_date >= NOW() - INTERVAL 48 HOUR 
                 AND n.status != 'rejeitada'
                 ORDER BY n.score DESC, n.publication_date DESC 
                 LIMIT ?`,
                [limitNum]
            );
            console.log(`[NewsRepo] Top News encontradas: ${rows.length}`);
            
            // Garantir que cada notícia tem um source_name, mesmo se NULL no DB
            return rows.map(row => ({
                ...row,
                source_name: row.source_name || 'Fonte Desconhecida'
            }));
        } catch (error) {
            console.error('[NewsRepo] Erro ao buscar Top News:', error);
            console.error(error.stack);
            throw error;
        }
    }
}

module.exports = NewsRepository;
