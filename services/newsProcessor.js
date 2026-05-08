const { fetchRssFeed } = require('./rssService');
const SourceRepository = require('../repositories/sourceRepository');
const NewsRepository = require('../repositories/newsRepository');
const LogRepository = require('../repositories/logRepository');
const ValidationService = require('./validationService');

/**
 * Processa uma única notícia, sanitiza, verifica duplicação e salva
 */
async function processAndSaveItem(newsRepo, rawItem) {
    // 1. Lógica de extração da imagem
    let main_image = null;
    if (rawItem.media && rawItem.media['$'] && rawItem.media['$'].url) {
        main_image = rawItem.media['$'].url;
    } else if (rawItem.enclosure && rawItem.enclosure.url && rawItem.enclosure.type && rawItem.enclosure.type.startsWith('image/')) {
        main_image = rawItem.enclosure.url;
    } else {
        const contentStr = rawItem.full_content || rawItem.content || '';
        const imgMatch = contentStr.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) {
            main_image = imgMatch[1];
        }
    }
    rawItem.main_image = main_image;

    // 2. Sanitiza os dados estruturando para o BD (V2)
    const cleanNews = ValidationService.sanitizeNews(rawItem);

    if (!cleanNews.title || !cleanNews.original_link) {
        return { status: 'invalid' };
    }

    // 3. Checa duplicação avançada por link ou hash de conteúdo
    const exists = await newsRepo.findByLinkOrHash(cleanNews.original_link, cleanNews.content_hash);
    if (exists) {
        console.log(`[PROCESSOR] 🔁 Duplicada ignorada: ${cleanNews.title}`);
        return { status: 'duplicate' };
    }

    // 4. Persiste no banco de dados estruturado
    await newsRepo.create(cleanNews);
    console.log(`[PROCESSOR] ✅ Salva [status: ${cleanNews.status}]: ${cleanNews.title}`);
    return { status: 'saved' };
}

/**
 * Orquestra a coleta usando o modelo Repository
 * @param {Object} pool Conexão com o banco
 */
async function runNewsCollection(pool) {
    const sourceRepo = new SourceRepository(pool);
    const newsRepo = new NewsRepository(pool);
    const logRepo = new LogRepository(pool);

    console.log('\n=======================================');
    console.log(`[COLETA V2] 🚀 Iniciando coleta estruturada - ${new Date().toLocaleString()}`);
    console.log('=======================================');

    const sources = await sourceRepo.getActiveSources();
    console.log(`[COLETA] Encontradas ${sources.length} fontes ativas no Banco de Dados.`);

    for (const source of sources) {
        const startTime = new Date();
        const logData = {
            source_id: source.id,
            start_time: startTime,
            news_found: 0,
            news_saved: 0,
            duplicates: 0,
            errors: []
        };

        try {
            // Mapeando fonte do BD para o formato que o RSS service espera
            const rssSourceConfig = {
                name: source.name,
                url: source.rss_url,
                category: source.category,
                language: source.language
            };

            const items = await fetchRssFeed(rssSourceConfig);
            logData.news_found = items.length;
            
            for (const item of items) {
                try {
                    // Injetando dados da fonte no item bruto
                    item.source_id = source.id;
                    item.category = source.category;
                    item.language = source.language;
                    item.publication_date = item.isoDate || item.pubDate;
                    item.author = item.creator || item.author;

                    const result = await processAndSaveItem(newsRepo, item);
                    
                    if (result.status === 'saved') logData.news_saved++;
                    else if (result.status === 'duplicate') logData.duplicates++;

                } catch (itemErr) {
                    console.error(`[PROCESSOR] ❌ Erro ao processar item de ${source.name}:`, itemErr.message);
                    logData.errors.push(`Item: ${itemErr.message}`);
                }
            }
            
            // Atualiza data de última coleta da fonte
            await sourceRepo.updateLastCollected(source.id);
            logData.status = logData.errors.length > 0 ? 'partial' : 'success';

        } catch (error) {
            console.error(`[COLETA] ❌ Erro na fonte ${source.name}:`, error.message);
            logData.errors.push(`Source: ${error.message}`);
            logData.status = 'error';
        }

        // Finaliza medição e salva o log desta fonte
        logData.end_time = new Date();
        logData.duration_ms = logData.end_time.getTime() - logData.start_time.getTime();
        await logRepo.createLog(logData);
    }

    console.log('=======================================');
    console.log(`[COLETA V2] ✅ Coleta finalizada - ${new Date().toLocaleString()}`);
    console.log('=======================================\n');
}

module.exports = {
    runNewsCollection
};
