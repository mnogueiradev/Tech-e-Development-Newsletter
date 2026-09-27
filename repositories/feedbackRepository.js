class FeedbackRepository {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Insere ou atualiza o voto de feedback de um inscrito para uma notícia (Upvote / Downvote)
     */
    async upsertFeedback({ newsId, subscriberId, vote }) {
        try {
            const [result] = await this.pool.execute(
                `INSERT INTO news_feedback (news_id, subscriber_id, vote)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE vote = VALUES(vote), updated_at = CURRENT_TIMESTAMP`,
                [newsId, subscriberId, vote]
            );
            return result;
        } catch (error) {
            console.error(`[FeedbackRepo] Erro ao registrar voto (${vote}) para notícia ${newsId} pelo inscrito ${subscriberId}:`, error);
            throw error;
        }
    }

    /**
     * Retorna a contagem de votos positivos (up) e negativos (down) de uma notícia
     */
    async getFeedbackByNews(newsId) {
        try {
            const [rows] = await this.pool.execute(
                `SELECT 
                    SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS upvotes,
                    SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS downvotes,
                    COUNT(*) AS total_votes
                 FROM news_feedback 
                 WHERE news_id = ?`,
                [newsId]
            );
            return {
                upvotes: Number(rows[0]?.upvotes || 0),
                downvotes: Number(rows[0]?.downvotes || 0),
                totalVotes: Number(rows[0]?.total_votes || 0)
            };
        } catch (error) {
            console.error(`[FeedbackRepo] Erro ao buscar feedback da notícia ${newsId}:`, error);
            throw error;
        }
    }

    /**
     * Retorna o ranking das notícias mais bem avaliadas pela comunidade
     */
    async getTopRatedNews(limit = 10) {
        try {
            const limitNum = Number(limit) || 10;
            const [rows] = await this.pool.query(
                `SELECT n.id, n.title, n.original_link, n.category, n.score,
                        SUM(CASE WHEN f.vote = 'up' THEN 1 ELSE 0 END) AS upvotes,
                        SUM(CASE WHEN f.vote = 'down' THEN 1 ELSE 0 END) AS downvotes,
                        COUNT(f.id) AS total_feedback
                 FROM news_v2 n
                 JOIN news_feedback f ON f.news_id = n.id
                 WHERE n.status != 'rejeitada'
                 GROUP BY n.id
                 ORDER BY upvotes DESC, n.score DESC
                 LIMIT ${limitNum}`
            );
            return rows;
        } catch (error) {
            console.error('[FeedbackRepo] Erro ao buscar notícias mais bem avaliadas:', error);
            throw error;
        }
    }

    /**
     * Retorna estatísticas gerais de participação do público no feedback
     */
    async getFeedbackStats() {
        try {
            const [[stats]] = await this.pool.query(
                `SELECT 
                    COUNT(*) AS total_votes,
                    SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS total_upvotes,
                    SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS total_downvotes,
                    COUNT(DISTINCT subscriber_id) AS unique_voters,
                    COUNT(DISTINCT news_id) AS news_evaluated
                 FROM news_feedback`
            );
            return {
                totalVotes: Number(stats.total_votes || 0),
                totalUpvotes: Number(stats.total_upvotes || 0),
                totalDownvotes: Number(stats.total_downvotes || 0),
                uniqueVoters: Number(stats.unique_voters || 0),
                newsEvaluated: Number(stats.news_evaluated || 0)
            };
        } catch (error) {
            console.error('[FeedbackRepo] Erro ao buscar estatísticas gerais de feedback:', error);
            throw error;
        }
    }
}

module.exports = FeedbackRepository;
