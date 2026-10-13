function getEditionDate(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function getPreviousEditionDate(date = new Date()) {
    const previousDate = new Date(`${getEditionDate(date)}T00:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    return getEditionDate(previousDate);
}

class NewsletterHistoryRepository {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Retorna notícias que apareceram na edição anterior, incluindo seleções
     * antigas anteriores à criação do registro de conteúdo enviado.
     */
    async getPreviousEditionNewsIds(date = new Date()) {
        const previousEditionDate = getPreviousEditionDate(date);
        const [rows] = await this.pool.execute(
            `SELECT news_id FROM edition_selections WHERE edition_date = ?
             UNION
             SELECT news_id FROM newsletter_edition_news WHERE edition_date = ?`,
            [previousEditionDate, previousEditionDate]
        );

        return new Set(rows.map(row => Number(row.news_id)));
    }

    /**
     * Registra o conteúdo que será usado nos emails desta edição. O registro
     * ocorre antes do envio para que falhas parciais nunca permitam repetição
     * no dia seguinte.
     */
    async recordEditionNews(items, date = new Date()) {
        const editionDate = getEditionDate(date);
        const newsIds = [...new Set((items || [])
            .map(item => Number(item.id || item.news_id))
            .filter(id => Number.isInteger(id) && id > 0))];

        if (newsIds.length === 0) return 0;

        const values = newsIds.map(() => '(?, ?)').join(', ');
        const params = newsIds.flatMap(newsId => [editionDate, newsId]);
        await this.pool.execute(
            `INSERT IGNORE INTO newsletter_edition_news (edition_date, news_id)
             VALUES ${values}`,
            params
        );

        return newsIds.length;
    }
}

module.exports = NewsletterHistoryRepository;
