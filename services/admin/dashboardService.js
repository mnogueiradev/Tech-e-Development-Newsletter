class DashboardService {
    constructor(pool) {
        this.pool = pool;
    }

    async getDashboardData() {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfTodayStr = startOfToday.toISOString().slice(0, 19).replace('T', ' ');

        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const startOfYesterdayStr = startOfYesterday.toISOString().slice(0, 19).replace('T', ' ');

        try {
            // 1. Status do Banco
            let dbConnected = false;
            let dbLatency = 0;
            try {
                const startTimer = Date.now();
                await this.pool.execute('SELECT 1');
                dbLatency = Date.now() - startTimer;
                dbConnected = true;
            } catch (e) {
                console.error("DB Status Check Error:", e);
            }

            // 2. Métricas
            const [subsRows] = await this.pool.execute('SELECT COUNT(*) as count FROM subscribers');
            const totalSubscribers = subsRows[0].count;

            const [newsTodayRows] = await this.pool.execute(
                'SELECT COUNT(*) as count FROM news_v2 WHERE created_at >= ?',
                [startOfTodayStr]
            );
            const newsToday = newsTodayRows[0].count;

            const [newsYesterdayRows] = await this.pool.execute(
                'SELECT COUNT(*) as count FROM news_v2 WHERE created_at >= ? AND created_at < ?',
                [startOfYesterdayStr, startOfTodayStr]
            );
            const newsYesterday = newsYesterdayRows[0].count;

            let selectedNews = 0;
            try {
                const [selRows] = await this.pool.execute(
                    'SELECT COUNT(*) as count FROM edition_selections WHERE created_at >= ?',
                    [startOfTodayStr]
                );
                selectedNews = selRows[0].count;
            } catch (e) {}

            const [sourcesRows] = await this.pool.execute('SELECT COUNT(DISTINCT source) as count FROM news_v2');
            const totalSources = sourcesRows[0].count;

            // 3. Top News (Hoje)
            let topNews = [];
            try {
                const [topRows] = await this.pool.execute(
                    'SELECT id, title, source, score, created_at FROM news_v2 WHERE created_at >= ? ORDER BY score DESC LIMIT 5',
                    [startOfTodayStr]
                );
                topNews = topRows;
            } catch (e) {}

            // 4. Atividade Recente (Mocked logic built from real tables)
            let recentActivity = [];
            
            // Pega as 3 últimas notícias inseridas
            try {
                const [recentNewsRows] = await this.pool.execute(
                    'SELECT title, source, created_at FROM news_v2 ORDER BY created_at DESC LIMIT 3'
                );
                recentActivity.push(...recentNewsRows.map(n => ({
                    id: Math.random().toString(),
                    type: 'news_added',
                    message: `Notícia coletada de ${n.source}: ${n.title.substring(0, 30)}...`,
                    time: n.created_at
                })));
            } catch (e) {}

            // Pega as 2 últimas inscrições
            try {
                const [recentSubsRows] = await this.pool.execute(
                    'SELECT email, subscribed_at FROM subscribers ORDER BY subscribed_at DESC LIMIT 2'
                );
                recentActivity.push(...recentSubsRows.map(s => ({
                    id: Math.random().toString(),
                    type: 'new_subscriber',
                    message: `Novo inscrito: ${s.email.substring(0, 3)}***@***`,
                    time: s.subscribed_at
                })));
            } catch (e) {}

            // Ordena atividade recente por data desc
            recentActivity.sort((a, b) => new Date(b.time) - new Date(a.time));

            // Status Operacional
            const braveOk = !!process.env.BRAVE_API_KEY && process.env.BRAVE_API_KEY !== 'COLOQUE_SUA_CHAVE_AQUI';
            const resendOk = !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'COLOQUE_SUA_CHAVE_AQUI';

            return {
                systemStatus: {
                    api: "online",
                    db: dbConnected ? "connected" : "disconnected",
                    dbLatency: `${dbLatency}ms`,
                    lastCollection: "Hoje (Automático)",
                    lastNewsletter: "Hoje às 08:00"
                },
                metrics: {
                    totalSubscribers,
                    newsToday,
                    newsYesterday,
                    selectedNews,
                    totalSources
                },
                recentActivity: recentActivity.slice(0, 5),
                topNews,
                operationalStatus: {
                    render: true,
                    brave_api: braveOk,
                    resend: resendOk,
                    db: dbConnected,
                    auth: true
                }
            };
        } catch (err) {
            console.error("Erro ao gerar dashboard data:", err);
            throw err;
        }
    }
}

module.exports = DashboardService;
