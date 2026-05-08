const rssSources = require('../config/rssSources');
const { fetchRssFeed } = require('./rssService');
const { saveNews } = require('./newsPersistence');

/**
 * Processa uma única notícia (extrai campos e imagem) e a salva no banco
 */
async function processAndSaveItem(pool, item) {
    // Tenta extrair a imagem principal se existir
    let main_image = null;
    
    // De <media:content url="...">
    if (item.media && item.media['$'] && item.media['$'].url) {
        main_image = item.media['$'].url;
    } 
    // De <enclosure url="...">
    else if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
        main_image = item.enclosure.url;
    } 
    // Fallback: procura <img> no full_content ou contentSnippet
    else {
        const contentStr = item.full_content || item.content || '';
        const imgMatch = contentStr.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) {
            main_image = imgMatch[1];
        }
    }

    const newsData = {
        title: item.title,
        description: item.contentSnippet || item.description || '',
        original_link: item.link,
        source_name: item.source_name,
        publication_date: item.isoDate || item.pubDate || new Date().toISOString(),
        category: item.source_category,
        main_image: main_image,
        full_content: item.full_content || item.content || ''
    };

    if (!newsData.title || !newsData.original_link) {
        return; // Pula itens inválidos que não possuem título ou link
    }

    await saveNews(pool, newsData);
}

/**
 * Orquestra a coleta de todas as fontes RSS configuradas
 * @param {Object} pool Conexão com o banco de dados
 */
async function runNewsCollection(pool) {
    console.log('\n=======================================');
    console.log(`[COLETA] 🚀 Iniciando coleta de notícias - ${new Date().toLocaleString()}`);
    console.log('=======================================');

    for (const source of rssSources) {
        try {
            const items = await fetchRssFeed(source);
            
            for (const item of items) {
                // Salva uma por uma para garantir que não sobrecarregamos o banco
                // e para manter a ordem e clareza dos logs
                await processAndSaveItem(pool, item);
            }
            
        } catch (error) {
            console.error(`[COLETA] ❌ Erro não tratado ao processar a fonte ${source.name}:`, error.message);
            // Continua para a próxima fonte mesmo se essa der erro
        }
    }

    console.log('=======================================');
    console.log(`[COLETA] ✅ Coleta finalizada - ${new Date().toLocaleString()}`);
    console.log('=======================================\n');
}

module.exports = {
    runNewsCollection
};
