class LogRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async createLog(logData) {
        try {
            await this.pool.execute(
                `INSERT INTO collection_logs (
                    source_id, start_time, end_time, duration_ms, 
                    news_found, news_saved, duplicates, errors, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    logData.source_id,
                    logData.start_time,
                    logData.end_time,
                    logData.duration_ms,
                    logData.news_found || 0,
                    logData.news_saved || 0,
                    logData.duplicates || 0,
                    logData.errors ? JSON.stringify(logData.errors) : null,
                    logData.status || 'success'
                ]
            );
        } catch (error) {
            console.error('[LogRepo] Falha ao salvar log de coleta:', error);
        }
    }
}

module.exports = LogRepository;
