class SimilarityGrouper {
    /**
     * Verifica se a notícia A é muito similar à notícia B (mesmo tópico central)
     * Lógica simples focada em palavras-chave importantes do título.
     */
    static isSimilar(newsA, newsB) {
        if (!newsA.title || !newsB.title) return false;

        const titleAWords = String(newsA.title).toLowerCase().match(/\b\w{5,}\b/g) || [];
        const titleBWords = String(newsB.title).toLowerCase().match(/\b\w{5,}\b/g) || [];

        // Verifica quantas palavras longas batem entre os dois títulos
        const matches = titleAWords.filter(word => titleBWords.includes(word));

        // Se tiverem 3 ou mais palavras principais iguais, consideramos "mesmo tópico"
        return matches.length >= 3;
    }
}

module.exports = SimilarityGrouper;
