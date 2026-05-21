module.exports = {
    version: '1.0.0',
    limits: {
        maxNewsPerEdition: 9, // Total de notícias que queremos na edição
        maxPerSource: 2,      // Evita que a newsletter seja inteira só de 1 site
        maxSimilarTopics: 1   // Ex: só 1 notícia falando sobre "OpenAI lança agente"
    },
    weights: {
        freshnessPenaltyPerDelayHour: 0.5 // Deduz score se a notícia for mais velha
    }
};
