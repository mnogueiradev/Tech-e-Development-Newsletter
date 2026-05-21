const config = require('../../../config/scoreConfig');

class RecencyScorer {
    static calculate(news) {
        let score = 0;
        let reasons = [];
        
        if (!news.publication_date) return { points: 0, reasons: [] };

        const pubDate = new Date(news.publication_date);
        const now = new Date();
        const diffHours = (now - pubDate) / (1000 * 60 * 60);

        if (diffHours <= 2) {
            score = 15;
            reasons.push(`+15 Notícia Super Recente (últimas 2h)`);
        } else if (diffHours <= 6) {
            score = 10;
            reasons.push(`+10 Notícia Recente (últimas 6h)`);
        } else if (diffHours <= 12) {
            score = 5;
            reasons.push(`+5 Notícia Fresca (últimas 12h)`);
        } else if (diffHours <= 24) {
            score = 2;
            reasons.push(`+2 Notícia de Hoje (últimas 24h)`);
        } else {
            // Notícias velhas perdem pontos
            score = -5;
            reasons.push(`-5 Notícia Antiga (mais de 24h)`);
        }

        return {
            points: score * config.weights.recency,
            reasons: reasons
        };
    }
}

module.exports = RecencyScorer;
