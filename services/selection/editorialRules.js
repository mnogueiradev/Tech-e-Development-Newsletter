const config = require('../../config/selectionConfig');
const SimilarityGrouper = require('./similarityGrouper');

class EditorialRules {
    constructor() {
        this.selectedSourcesCount = {};
        this.selectedNews = [];
    }

    /**
     * Reseta as contagens de controle para uma nova edição
     */
    reset() {
        this.selectedSourcesCount = {};
        this.selectedNews = [];
    }

    /**
     * Verifica se a notícia passa pelas regras editoriais da edição
     * Retorna { passed: boolean, reason: string }
     */
    evaluate(news) {
        // Regra 1: Diversidade de Fontes (Max por fonte)
        const sourceName = news.source_name || 'Desconhecido';
        const sourceCount = this.selectedSourcesCount[sourceName] || 0;
        
        if (sourceCount >= config.limits.maxPerSource) {
            return {
                passed: false,
                reason: `Rejeitada: Limite da fonte atingido (${config.limits.maxPerSource} notícias de ${sourceName})`
            };
        }

        // Regra 2: Diversidade Temática (Repetição)
        let similarTo = null;
        for (const selected of this.selectedNews) {
            if (SimilarityGrouper.isSimilar(news, selected)) {
                similarTo = selected;
                break;
            }
        }

        if (similarTo) {
            return {
                passed: false,
                reason: `Rejeitada: Tema repetido. Já escolhemos uma notícia muito similar ('${similarTo.title}')`
            };
        }

        // Se passou em tudo, é aceita.
        return {
            passed: true,
            reason: `Aceita: Alto score e contribui para a diversidade (Fonte: ${sourceName}, Tema Único)`
        };
    }

    /**
     * Registra que a notícia foi escolhida, atualizando os contadores internos
     */
    registerSelection(news) {
        const sourceName = news.source_name || 'Desconhecido';
        this.selectedSourcesCount[sourceName] = (this.selectedSourcesCount[sourceName] || 0) + 1;
        this.selectedNews.push(news);
    }
}

module.exports = EditorialRules;
