const config = require('../../config/scoreConfig');
const KeywordScorer = require('./scorers/keywordScorer');
const SourceScorer = require('./scorers/sourceScorer');
const RecencyScorer = require('./scorers/recencyScorer');
const PenaltyScorer = require('./scorers/penaltyScorer');
const ImpactScorer = require('./scorers/impactScorer');
const TrendScorer = require('./scorers/trendScorer');

class ScoreEngine {
    /**
     * Calcula o score final de uma notícia passando por todos os critérios
     * @param {Object} news Objeto da notícia (já sanitizada)
     * @param {Array} recentNewsList Outras notícias para o cálculo de Trend/Repetição
     * @returns {Object} { finalScore, detailedScore, reasons, version }
     */
    static calculateScore(news, recentNewsList = []) {
        let finalScore = 0;
        let allReasons = [];
        let detailedScore = {};

        // 1. Palavras-Chave (Keywords)
        const kwRes = KeywordScorer.calculate(news);
        finalScore += kwRes.points;
        detailedScore.keyword = kwRes.points;
        allReasons.push(...kwRes.reasons);

        // 2. Fonte (Source)
        const srcRes = SourceScorer.calculate(news);
        finalScore += srcRes.points;
        detailedScore.source = srcRes.points;
        allReasons.push(...srcRes.reasons);

        // 3. Frescor (Recency)
        const recRes = RecencyScorer.calculate(news);
        finalScore += recRes.points;
        detailedScore.recency = recRes.points;
        allReasons.push(...recRes.reasons);

        // 4. Penalidades (Gossip/Clickbait)
        const penRes = PenaltyScorer.calculate(news);
        finalScore += penRes.points;
        detailedScore.penalty = penRes.points;
        allReasons.push(...penRes.reasons);

        // 5. Impacto e Tendências de Mercado
        const impRes = ImpactScorer.calculate(news);
        finalScore += impRes.points;
        detailedScore.impact = impRes.points;
        allReasons.push(...impRes.reasons);

        // 6. Repetição / Trending Topics
        const trendRes = TrendScorer.calculate(news, recentNewsList);
        finalScore += trendRes.points;
        detailedScore.trend = trendRes.points;
        allReasons.push(...trendRes.reasons);

        return {
            finalScore: Math.round(finalScore * 100) / 100, // Arredonda pra 2 casas decimais
            detailedScore: detailedScore,
            reasons: allReasons,
            version: config.version,
            calculated_at: new Date().toISOString()
        };
    }

    /**
     * Formata os logs de explicação do score no formato esperado
     */
    static formatExplanationLog(newsTitle, result) {
        let log = `\n📊 Score Analisado: ${newsTitle}\n`;
        result.reasons.forEach(r => {
            log += `   ${r}\n`;
        });
        log += `   ===================\n`;
        log += `   Score final: ${result.finalScore}\n`;
        return log;
    }
}

module.exports = ScoreEngine;
