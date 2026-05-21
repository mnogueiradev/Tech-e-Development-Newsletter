const config = require('../../../config/scoreConfig');

class PenaltyScorer {
    static calculate(news) {
        let score = 0;
        let reasons = [];
        
        const textToAnalyze = `${news.title} ${news.description || ''}`.toLowerCase();

        config.penalties.gossip.forEach(term => {
            if (textToAnalyze.includes(term)) {
                score -= 15;
                reasons.push(`-15 Penalidade Fofoca/Entretenimento ('${term}')`);
            }
        });

        config.penalties.clickbait.forEach(term => {
            if (textToAnalyze.includes(term)) {
                score -= 20;
                reasons.push(`-20 Penalidade Clickbait ('${term}')`);
            }
        });

        return {
            points: score * config.weights.penalty,
            reasons: reasons
        };
    }
}

module.exports = PenaltyScorer;
