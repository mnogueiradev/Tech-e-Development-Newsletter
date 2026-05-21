const config = require('../../../config/scoreConfig');

class SourceScorer {
    static calculate(news) {
        let score = 0;
        let reasons = [];
        
        const sourceName = news.source_name;
        
        // Verifica se a fonte tem peso customizado
        if (config.sourceWeights[sourceName]) {
            score = config.sourceWeights[sourceName];
            reasons.push(`+${score} Fonte Confiável/Prioritária ('${sourceName}')`);
        } else {
            // Pontuação padrão para fontes genéricas
            score = 2;
            reasons.push(`+${score} Fonte Padrão ('${sourceName}')`);
        }

        return {
            points: score * config.weights.source,
            reasons: reasons
        };
    }
}

module.exports = SourceScorer;
