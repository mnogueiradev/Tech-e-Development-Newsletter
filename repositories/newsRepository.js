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
                    status, content_hash, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
}

module.exports = NewsRepository;
