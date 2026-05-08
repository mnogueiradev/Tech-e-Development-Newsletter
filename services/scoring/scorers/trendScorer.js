const config = require('../../../config/scoreConfig');

class TrendScorer {
    /**
     * Calcula se a notícia está repercutindo em outras fontes
     * @param {Object} news A notícia atual
     * @param {Array} recentNewsList Lista de outras notícias recentes para comparar
     */
    static calculate(news, recentNewsList = []) {
        let score = 0;
        let reasons = [];
        
        // Extrai palavras significativas do título (>= 5 letras) para evitar preposições/artigos
        const titleWords = news.title.toLowerCase().match(/\b\w{5,}\b/g) || [];
        
        if (titleWords.length === 0 || recentNewsList.length === 0) {
            return { points: 0, reasons: [] };
        }

        let similarCount = 0;

        for (const otherNews of recentNewsList) {
            // Ignora a própria notícia
            if (otherNews.id === news.id || otherNews.original_link === news.original_link) continue;
            
            const otherTitle = otherNews.title.toLowerCase();
            
            // Conta quantas palavras-chave do título batem com o outro título
            const matches = titleWords.filter(word => otherTitle.includes(word));
            
            // Lógica simples: se bater 3 ou mais palavras longas, assumimos que é o mesmo assunto
            if (matches.length >= 3) {
                similarCount++;
            }
        }

        if (similarCount > 0) {
            // Limita a bonificação para não explodir o score caso 20 sites copiem
            const cappedCount = Math.min(similarCount, 5); 
            score = cappedCount * 5; 
            reasons.push(`+${score} Repetição em Fontes (${similarCount} outras fontes no mesmo tema)`);
        }

        return {
            points: score * config.weights.trend,
            reasons: reasons
        };
    }
}

module.exports = TrendScorer;
