module.exports = {
    version: '1.1.0',
    limits: {
        maxNewsPerEdition: 9, // Total de notícias que queremos na edição
        maxPerSource: 2,      // Evita que a newsletter seja inteira só de 1 site
        maxSimilarTopics: 1,  // Ex: só 1 notícia falando sobre o mesmo lançamento
        maxOrganizationShare: 0.2,
        smallEditionThreshold: 5,
        smallEditionMaxPerOrganization: 1,
        maxCategoryDiversityPenalty: 0.6,
        maxOrganizationDiversityPenalty: 0.2
    },
    weights: {
        freshnessPenaltyPerDelayHour: 0.5, // Deduz score se a notícia for mais velha
        repeatedCategoryPenalty: 0.25,
        repeatedOrganizationPenalty: 0.1
    }
};
