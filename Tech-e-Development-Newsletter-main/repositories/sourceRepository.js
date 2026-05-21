class SourceRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async getActiveSources() {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM news_sources WHERE is_active = TRUE ORDER BY priority DESC'
            );
            return rows;
        } catch (error) {
            console.error('[SourceRepo] Erro ao buscar fontes ativas:', error);
            throw error;
        }
    }

    async updateLastCollected(id) {
        try {
            await this.pool.execute(
                'UPDATE news_sources SET last_collected_at = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );
        } catch (error) {
            console.error(`[SourceRepo] Erro ao atualizar data de coleta para id ${id}:`, error);
        }
    }
}

module.exports = SourceRepository;
