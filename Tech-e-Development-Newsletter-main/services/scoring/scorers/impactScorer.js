const config = require('../../../config/scoreConfig');

class ImpactScorer {
    static calculate(news) {
        let score = 0;
        let reasons = [];
        
        const textToAnalyze = `${news.title} ${news.description || ''}`.toLowerCase();

        config.impactTerms.forEach(term => {
            if (textToAnalyze.includes(term)) {
                score += 10;
                reasons.push(`+10 Potencial de Impacto/Tendência ('${term}')`);
            }
        });

        return {
            points: score * config.weights.impact,
            reasons: reasons
        };
    }
}

module.exports = ImpactScorer;
