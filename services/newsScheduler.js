const cron = require('node-cron');
const { runNewsCollection } = require('./newsProcessor');

/**
 * Inicializa o agendamento da coleta de notícias
 * @param {Object} pool Conexão com o banco de dados
 */
function initNewsScheduler(pool) {
    // Configura para rodar a cada 30 minutos para manter o banco sempre atualizado.
    // O padrão cron "*/30 * * * *" significa a cada 30 minutos.
    cron.schedule('*/30 * * * *', async () => {
        console.log('[SCHEDULER] ⏳ Disparando coleta automática de notícias (Cron)...');
        await runNewsCollection(pool);
    });

    console.log('✅ Scheduler de coleta de notícias inicializado (Executando a cada 30 minutos).');
}

module.exports = {
    initNewsScheduler,
    runNewsCollection // Exportado para uso na rota manual em server.js
};
