const config = require('../../../config/scoreConfig');

class KeywordScorer {
    static calculate(news) {
        let score = 0;
        let reasons = [];
        
        const textToAnalyze = `${news.title} ${news.description || ''}`.toLowerCase();

        // High priority keywords
        config.keywords.high.forEach(keyword => {
            if (textToAnalyze.includes(keyword)) {
                score += 15;
                reasons.push(`+15 Keyword Alta Relevância ('${keyword}')`);
            }
        });

        // Medium priority keywords
        config.keywords.medium.forEach(keyword => {
            if (textToAnalyze.includes(keyword)) {
                score += 5;
                reasons.push(`+5 Keyword Média Relevância ('${keyword}')`);
            }
        });

        return {
            points: score * config.weights.keyword,
            reasons: reasons
        };
    }
}

module.exports = KeywordScorer;
