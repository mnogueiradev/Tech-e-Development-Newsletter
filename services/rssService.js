const Parser = require('rss-parser');

const parser = new Parser({
    customFields: {
        item: [
            ['content:encoded', 'full_content'],
            ['media:content', 'media'],
            ['enclosure', 'enclosure']
        ]
    }
});

/**
 * Coleta as notícias de um feed RSS específico
 * @param {Object} source Objeto contendo nome, url e categoria da fonte
 * @returns {Promise<Array>} Lista de notícias extraídas do feed
 */
async function fetchRssFeed(source) {
    try {
        console.log(`[RSS] Coletando fonte: ${source.name} (${source.url})`);
        const feed = await parser.parseURL(source.url);
        console.log(`[RSS] ${feed.items.length} notícias encontradas em ${source.name}`);
        
        return feed.items.map(item => ({
            ...item,
            source_name: source.name,
            source_category: source.category
        }));
    } catch (error) {
        console.error(`[RSS] ❌ Erro ao coletar fonte ${source.name}:`, error.message);
        return []; // Retorna array vazio para não interromper a coleta de outras fontes
    }
}

module.exports = {
    fetchRssFeed
};
