const { isLegacyNews, legacyNewsSql, isMissingDiscoveryTable, getNewsOriginRows } = require('../services/editorial/legacyNewsPolicy');

class SelectionRepository {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Salva as notícias selecionadas para uma edição
     */
    async saveSelections(selections, algorithmVersion) {
        // Usa a data atual como "edição do dia" (ex: '2024-05-10')
        const todayStr = new Date().toISOString().split('T')[0];

        try {
            const ids = selections.map(item => Number(item?.id));
            if (ids.some(id => !Number.isInteger(id) || id <= 0)) {
                throw new Error('Seleção legada bloqueada: notícia sem ID verificável.');
            }
            const uniqueIds = [...new Set(ids)];
            const verifiedRows = await getNewsOriginRows(this.pool, uniqueIds);
            const verifiedIds = new Set(verifiedRows.map(row => Number(row.id)));
            if (uniqueIds.some(id => !verifiedIds.has(id))) {
                throw new Error('Seleção legada bloqueada: nem todas as notícias existem no banco.');
            }
            if (verifiedRows.some(row => !isLegacyNews(row))) {
                const error = new Error('Seleção legada bloqueada: notícias Brave exigem aprovação editorial.');
                error.code = 'UNAPPROVED_EDITORIAL_CONTENT';
                throw error;
            }

            // Se já gerou seleção hoje, vamos limpar antes de gerar a nova para garantir frescor 
            // (Isso permite rodar o gerador várias vezes sem duplicar)
            await this.pool.execute(
                `DELETE FROM edition_selections WHERE edition_date = ?`,
                [todayStr]
            );

            // Salvar as novas seleções
            for (let i = 0; i < selections.length; i++) {
                const item = selections[i];
                await this.pool.execute(
                    `INSERT INTO edition_selections (news_id, edition_date, position, reason, algorithm_version)
                     VALUES (?, ?, ?, ?, ?)`,
                    [item.id, todayStr, i + 1, item.selectionReason, algorithmVersion]
                );
            }

            // Garante que a edição pública correspondente existe na tabela editions
            const [dateYear, dateMonth, dateDay] = todayStr.split('-');
            const title = `Techndevn Newsletter — Edição de ${dateDay}/${dateMonth}/${dateYear}`;
            await this.pool.execute(
                `INSERT IGNORE INTO editions (edition_date, slug, title, description)
                 VALUES (?, ?, ?, ?)`,
                [todayStr, todayStr, title, 'As principais notícias de tecnologia e desenvolvimento curadas pela nossa IA.']
            );

            console.log(`[SelectionRepo] ✅ ${selections.length} notícias salvas para a edição de ${todayStr}`);
            return true;
        } catch (error) {
            console.error('[SelectionRepo] ❌ Erro ao salvar seleções da edição:', error);
            throw error;
        }
    }

    /**
     * Busca as notícias selecionadas para a edição de hoje
     */
    async getTodaySelections() {
        const todayStr = new Date().toISOString().split('T')[0];
        try {
            const query = includeDiscovery => `SELECT n.id, n.title, n.description, s.name as source_name,
                       s.rss_url as source_rss_url, n.original_link, n.main_image, es.position,
                       n.category, n.metadata
                FROM edition_selections es
                JOIN news_v2 n ON es.news_id = n.id
                LEFT JOIN news_sources s ON n.source_id = s.id
                WHERE es.edition_date = ?
                  AND ${legacyNewsSql('n', { includeDiscovery })}
                ORDER BY es.position ASC`;
            let rows;
            try {
                [rows] = await this.pool.execute(query(true), [todayStr]);
            } catch (error) {
                if (!isMissingDiscoveryTable(error)) throw error;
                [rows] = await this.pool.execute(query(false), [todayStr]);
            }
            
            return rows.filter(isLegacyNews);
        } catch (error) {
            console.error('[SelectionRepo] ❌ Erro ao buscar seleções de hoje:', error);
            return [];
        }
    }
}

module.exports = SelectionRepository;
