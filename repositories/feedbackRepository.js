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
     * Monta preferências individuais por fonte. Os votos recentes têm mais peso,
     * e votos negativos de notícias candidatas evitam que o mesmo link reapareça.
     */
    async getPersonalizationProfiles(subscriberIds, candidateNewsIds = []) {
        const ids = [...new Set((subscriberIds || [])
            .map(Number)
            .filter(id => Number.isSafeInteger(id) && id > 0))];
        const profiles = Object.create(null);
        if (ids.length === 0) return profiles;

        const subscriberPlaceholders = ids.map(() => '?').join(',');
        try {
            const [preferenceRows] = await this.pool.execute(
                `SELECT f.subscriber_id, n.source_id,
                        SUM(CASE WHEN f.vote = 'up' THEN POWER(0.5, GREATEST(TIMESTAMPDIFF(DAY, f.updated_at, CURRENT_TIMESTAMP), 0) / 90.0) ELSE 0 END) AS weighted_up,
                        SUM(CASE WHEN f.vote = 'down' THEN POWER(0.5, GREATEST(TIMESTAMPDIFF(DAY, f.updated_at, CURRENT_TIMESTAMP), 0) / 90.0) ELSE 0 END) AS weighted_down
                 FROM news_feedback f
                 JOIN news_v2 n ON n.id = f.news_id
                 WHERE f.subscriber_id IN (${subscriberPlaceholders})
                   AND n.source_id IS NOT NULL
                 GROUP BY f.subscriber_id, n.source_id`,
                ids
            );

            for (const row of preferenceRows) {
                const subscriberId = String(row.subscriber_id);
                if (!profiles[subscriberId]) {
                    profiles[subscriberId] = { sourcePreferences: Object.create(null), downvotedNewsIds: [] };
                }
                profiles[subscriberId].sourcePreferences[String(row.source_id)] = {
                    weightedUp: Number(row.weighted_up || 0),
                    weightedDown: Number(row.weighted_down || 0)
                };
            }

            const newsIds = [...new Set((candidateNewsIds || [])
                .map(Number)
                .filter(id => Number.isSafeInteger(id) && id > 0))];
            if (newsIds.length > 0) {
                const newsPlaceholders = newsIds.map(() => '?').join(',');
                const [downvoteRows] = await this.pool.execute(
                    `SELECT subscriber_id, news_id
                     FROM news_feedback
                     WHERE vote = 'down'
                       AND subscriber_id IN (${subscriberPlaceholders})
                       AND news_id IN (${newsPlaceholders})`,
                    [...ids, ...newsIds]
                );

                for (const row of downvoteRows) {
                    const subscriberId = String(row.subscriber_id);
                    if (!profiles[subscriberId]) {
                        profiles[subscriberId] = { sourcePreferences: Object.create(null), downvotedNewsIds: [] };
                    }
                    profiles[subscriberId].downvotedNewsIds.push(Number(row.news_id));
                }
            }

            for (const profile of Object.values(profiles)) {
                profile.hasFeedback = Object.keys(profile.sourcePreferences).length > 0 || profile.downvotedNewsIds.length > 0;
            }
            return profiles;
        } catch (error) {
            console.error('[FeedbackRepo] Erro ao montar perfis individuais:', error);
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
