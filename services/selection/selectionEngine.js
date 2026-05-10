const config = require('../../config/selectionConfig');
const EditorialRules = require('./editorialRules');
const SelectionRepository = require('../../repositories/selectionRepository');
const NewsRepository = require('../../repositories/newsRepository');

class SelectionEngine {
    constructor(pool) {
        this.selectionRepo = new SelectionRepository(pool);
        this.newsRepo = new NewsRepository(pool);
        this.rules = new EditorialRules();
    }

    /**
     * Roda o algoritmo de curadoria para montar a newsletter do dia
     */
    async runDailySelection() {
        console.log(`\n[SELECTION_ENGINE] 🎩 Iniciando seleção editorial para a newsletter de hoje.`);
        
        // 1. Busca um pacote generoso de Top News (ex: as 30 melhores)
        // Isso nos dá opções para rejeitar algumas e continuar preenchendo a lista
        const candidates = await this.newsRepo.getTopNews(30);

        if (candidates.length === 0) {
            console.log(`[SELECTION_ENGINE] ⚠️ Nenhuma notícia recente encontrada para seleção.`);
            return [];
        }

        this.rules.reset();
        const finalSelection = [];

        console.log(`\n================= AVALIAÇÃO EDITORIAL =================`);

        // 2. Itera pelas candidatas (que já vêm ordenadas pelo maior Score)
        for (const news of candidates) {
            // Se já enchemos a newsletter, para o loop
            if (finalSelection.length >= config.limits.maxNewsPerEdition) {
                break;
            }

            // 3. Submete a notícia às regras editoriais (diversidade, repetição, etc)
            const evaluation = this.rules.evaluate(news);

            if (evaluation.passed) {
                console.log(`✅ [SELECIONADA] [Score: ${news.score}] ${news.title}`);
                console.log(`   -> Motivos: ${evaluation.reason}`);
                
                news.selectionReason = evaluation.reason;
                this.rules.registerSelection(news);
                finalSelection.push(news);
            } else {
                console.log(`❌ [REJEITADA]   [Score: ${news.score}] ${news.title}`);
                console.log(`   -> Motivos: ${evaluation.reason}`);
            }
        }

        console.log(`=======================================================\n`);

        if (finalSelection.length > 0) {
            // 4. Salva a seleção no banco
            await this.selectionRepo.saveSelections(finalSelection, config.version);
            console.log(`[SELECTION_ENGINE] 🏆 Seleção concluída: ${finalSelection.length} notícias escolhidas.`);
        } else {
            console.warn(`[SELECTION_ENGINE] ⚠️ Nenhuma notícia atendeu aos critérios editoriais hoje.`);
        }

        return finalSelection;
    }
}

module.exports = SelectionEngine;
