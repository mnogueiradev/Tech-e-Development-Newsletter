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

            console.log(`[SelectionRepo] ✅ ${selections.length} notícias salvas para a edição de ${todayStr}`);
            return true;
        } catch (error) {
            console.error('[SelectionRepo] ❌ Erro ao salvar seleções da edição:', error);
            throw error;
        }
    }
}

module.exports = SelectionRepository;
