require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const { sendEmail } = require('./services/emailSender');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { randomUUID } = crypto;
const { initializeDatabase } = require('./repositories/dbInit');
const { initNewsScheduler, runNewsCollection } = require('./services/newsScheduler');
const { translateNewsItems, isBrazilianSource } = require('./services/newsTranslation');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@techndevn.com';

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/Banner.png', express.static(path.join(__dirname, 'Banner.png')));
app.use('/Banner.gif', express.static(path.join(__dirname, 'Banner.gif')));

// Backend atua apenas como API. Não serve arquivos estáticos HTML.

// ========================
// 🔐 VALIDAÇÃO ENV
// ========================
if (!process.env.TIDB_URL) throw new Error("TIDB_URL não configurada");

// ========================
// 🗄️ DATABASE
// =======================
let pool;
async function initDB() {
    try {
        pool = mysql.createPool({
            uri: process.env.TIDB_URL,
            ssl: { rejectUnauthorized: true },
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });

        await pool.execute(`CREATE TABLE IF NOT EXISTS subscribers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            timezone VARCHAR(100) DEFAULT 'America/Sao_Paulo',
            topic VARCHAR(100) DEFAULT 'tecnologia',
            token VARCHAR(36) UNIQUE,
            subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        try {
            await pool.execute(`ALTER TABLE subscribers ADD COLUMN timezone VARCHAR(100) DEFAULT 'America/Sao_Paulo'`);
            console.log('✅ Coluna timezone adicionada à tabela de inscritos (ou já existia).');
        } catch (e) { }

        try {
            await pool.execute(`ALTER TABLE subscribers ADD COLUMN topic VARCHAR(100) DEFAULT 'tecnologia'`);
            console.log('✅ Coluna topic adicionada à tabela de inscritos (ou já existia).');
        } catch (e) { }

        // Migration segura (compatível com MySQL 8.0+, TiDB Cloud e MariaDB) para adicionar coluna 'token'
        try {
            const [cols] = await pool.query(
                `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'subscribers'
                   AND COLUMN_NAME = 'token'`
            );

            if (Number(cols[0].count) === 0) {
                await pool.execute(`ALTER TABLE subscribers ADD COLUMN token VARCHAR(36)`);
                await pool.execute(`UPDATE subscribers SET token = UUID() WHERE token IS NULL OR token = ''`);

                const [indexes] = await pool.query(
                    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
                     WHERE TABLE_SCHEMA = DATABASE()
                       AND TABLE_NAME = 'subscribers'
                       AND INDEX_NAME = 'idx_subscribers_token'`
                );
                if (Number(indexes[0].count) === 0) {
                    await pool.execute(`ALTER TABLE subscribers ADD UNIQUE INDEX idx_subscribers_token (token)`);
                }

                await pool.execute(`ALTER TABLE subscribers MODIFY token VARCHAR(36) NOT NULL`);
                console.log('✅ Coluna token (UUID) criada e preenchida na tabela de inscritos.');
            }
        } catch (e) {
            console.warn('⚠️ Aviso ao verificar/criar coluna token:', e.message);
        }

        // Garante que TODOS os inscritos existentes sem token recebam um UUID permanente
        try {
            await pool.execute(`UPDATE subscribers SET token = UUID() WHERE token IS NULL OR token = ''`);
        } catch (e) {
            console.warn('⚠️ Aviso ao garantir preenchimento de tokens UUID em subscribers:', e.message);
        }

        console.log('✅ Banco conectado');

        setInterval(async () => {
            try {
                await pool.execute('SELECT 1');
            } catch (e) {
                console.warn('⚠️ Keep-alive falhou:', e.message);
            }
        }, 4 * 60 * 1000);

        await loadSchedules();

        // Inicialização da parte de coleta de notícias (RSS)
        await initializeDatabase(pool);
        initNewsScheduler(pool);

        // Reclassifica notícias legadas no banco para distribuir entre as 8 categorias canônicas
        setTimeout(async () => {
            try {
                const CategoryRepository = require('./repositories/categoryRepository');
                const catRepo = new CategoryRepository(pool);
                await catRepo.reclassifyAllNewsInDB();
            } catch (reclassErr) {
                console.error('⚠️ Erro ao reclassificar notícias no boot:', reclassErr.message);
            }
        }, 3000);
    } catch (err) {
        console.error('❌ Erro no DB:', err.message);
        process.exit(1);
    }
}
initDB();

// ========================
// 🔁 RETRY DB
// ========================
async function safeExecute(query, params, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await pool.execute(query, params);
        } catch (err) {
            console.error(`DB erro tentativa ${i + 1}:`, err.message);
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

// ========================
// 📧 EMAIL (Resend)
// =====================

// ========================
// 🚀 ROUTES
// =======================


// Rate Limiter para a rota de subscribe
const subscribeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Limita a 5 requisições por IP
    message: { error: 'Muitas requisições de inscrição. Tente novamente após 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rota de health check para o Render detectar o serviço
app.get('/api', (req, res) => {
    res.json({ status: 'ok', message: 'API Techndevn Newsletter rodando!' });
});

app.post('/subscribe', subscribeLimiter, async (req, res) => {
    console.log("🧠 BODY COMPLETO:", req.body);

    const { email, timezone, topic } = req.body;

    console.log("📩 Novo subscribe:", email);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ error: 'Email inválido.' });
    }

    const userTZ = timezone || 'America/Sao_Paulo';
    const userTopic = topic || 'tecnologia';
    const subscriberToken = randomUUID();

    try {
        const SubscriberRepository = require('./repositories/subscriberRepository');
        const subscriberRepo = new SubscriberRepository(pool);

        await subscriberRepo.create({
            email,
            timezone: userTZ,
            topic: userTopic,
            token: subscriberToken
        });

        console.log(" Salvo no DB");

        const emailSent = await sendWelcomeNewsletter(email, userTopic);

        if (!emailSent) {
            // Se falhou ao enviar o email, deletamos do banco para não ficar "preso"
            await subscriberRepo.deleteByEmail(email);
            return res.status(500).json({
                error: "Falha ao enviar email de confirmação. Verifique os logs ou se o e-mail remetente está autorizado no Resend."
            });
        }

        scheduleCronForTimezone(userTZ);

        res.json({ success: true });

    } catch (err) {
        console.error(" Erro subscribe:", err);

        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Este email já está inscrito!' });
        }

        res.status(500).json({ error: 'Erro interno ao salvar email.' });
    }
});

// ========================
// 🛡️ SECURITY MIDDLEWARE
// ========================
let ACTIVE_ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ACTIVE_ADMIN_TOKEN) {
    ACTIVE_ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');
    console.warn("⚠️ AVISO DE SEGURANÇA: ADMIN_TOKEN não está definido. Foi gerado um token temporário aleatório.");
    console.warn(`Token temporário: ${ACTIVE_ADMIN_TOKEN}`);
}

const JWT_SECRET = process.env.JWT_SECRET || ACTIVE_ADMIN_TOKEN;

function verifyAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acesso negado. Token administrativo ausente.' });
    }
    
    const providedToken = authHeader.split(' ')[1];
    
    try {
        // Tenta validar como JWT primeiro (usado pelo painel web /admin)
        const decoded = jwt.verify(providedToken, JWT_SECRET);
        req.admin = decoded; // Se passou, é um token JWT válido
        return next();
    } catch (jwtErr) {
        // Se falhar no JWT, cai pro fallback (verifica se é o token estático do cron/scripts manuais)
        try {
            // Buffer precisa ter o mesmo tamanho para timingSafeEqual
            if (providedToken.length !== ACTIVE_ADMIN_TOKEN.length) {
                return res.status(401).json({ error: 'Acesso negado. Token inválido.' });
            }
            
            const isValid = crypto.timingSafeEqual(
                Buffer.from(providedToken),
                Buffer.from(ACTIVE_ADMIN_TOKEN)
            );
            
            if (!isValid) {
                return res.status(401).json({ error: 'Acesso negado. Token administrativo inválido.' });
            }
            return next();
        } catch (e) {
            return res.status(401).json({ error: 'Acesso negado. Erro de validação.' });
        }
    }
}

// ========================
// 🔑 AUTHENTICATION ROUTES
// ========================

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    if (email === adminEmail && password === adminPassword) {
        console.log(`[AUTH] ✅ Login realizado com sucesso para: ${email}`);
        
        // Gera o token JWT válido por 24 horas
        const token = jwt.sign({ role: 'admin', email }, JWT_SECRET, { expiresIn: '24h' });
        
        return res.json({
            success: true,
            token,
            message: 'Autenticado com sucesso'
        });
    } else {
        console.warn(`[AUTH] ❌ Tentativa de login falha para: ${email}`);
        return res.status(401).json({ error: 'Credenciais inválidas.' });
    }
});

app.get('/api/auth/verify', verifyAdmin, (req, res) => {
    res.json({ success: true, message: 'Sessão válida' });
});

app.get('/subscribers', verifyAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT id, email, timezone, topic, subscribed_at FROM subscribers`);
        res.status(200).json({
            total: rows.length,
            subscribers: rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar inscritos.' });
    }
});

app.get('/trigger-email', verifyAdmin, async (req, res) => {
    try {
        const resumo = await processAndSendNewsletter();
        if (!resumo || resumo.sent === 0) {
            // 0 e-mails enviados = falha: o cron externo considera qualquer 2xx um sucesso
            res.status(500).json({ message: 'Nenhum e-mail enviado. Verifique o console.', ...resumo });
        } else {
            res.json({ message: 'Newsletter processada e enviada com sucesso! Verifique o console.', ...resumo });
        }
    } catch (err) {
        console.error("Erro no /trigger-email:", err);
        res.status(500).json({ error: 'Erro interno ao processar e enviar a newsletter.' });
    }
});

app.get('/api/collect-news', verifyAdmin, async (req, res) => {
    try {
        // Dispara a coleta assíncrona, não precisamos aguardar para responder
        runNewsCollection(pool).catch(err => console.error("Erro na coleta em background:", err));
        res.json({ message: 'Coleta manual de notícias iniciada! Verifique os logs do console.' });
    } catch (err) {
        console.error("Erro no /api/collect-news:", err);
        res.status(500).json({ error: 'Erro interno ao iniciar coleta.' });
    }
});

app.get('/api/run-selection', verifyAdmin, async (req, res) => {
    try {
        const SelectionEngine = require('./services/selection/selectionEngine');
        const engine = new SelectionEngine(pool);
        const selections = await engine.runDailySelection();
        res.json({ 
            message: 'Seleção rodada com sucesso! Verifique os logs no console.',
            selectedCount: selections.length
        });
    } catch (err) {
        console.error("Erro no /api/run-selection:", err);
        res.status(500).json({ error: 'Erro interno ao rodar algoritmo de seleção.' });
    }
});

app.get('/api/admin/dashboard', verifyAdmin, async (req, res) => {
    try {
        const DashboardService = require('./services/admin/dashboardService');
        const dashboard = new DashboardService(pool);
        const data = await dashboard.getDashboardData();
        res.json(data);
    } catch (err) {
        console.error("Erro no /api/admin/dashboard:", err);
        res.status(500).json({ error: 'Erro interno ao carregar dados do dashboard.' });
    }
});

// ========================
// ADMIN CMS LOGIC
// ========================

app.post('/api/admin/news/collect', verifyAdmin, async (req, res) => {
    try {
        console.log("[API] Coleta manual de notícias acionada.");
        // Roda a coleta de forma assíncrona para não prender a requisição muito tempo
        runNewsCollection(pool).catch(err => {
            console.error("[API] Erro na coleta assíncrona:", err);
        });
        res.json({ message: 'Coleta de notícias iniciada em segundo plano. Os resultados aparecerão em alguns minutos.' });
    } catch (err) {
        console.error("Erro no /api/admin/news/collect:", err);
        res.status(500).json({ error: 'Erro ao iniciar a coleta.' });
    }
});

app.get('/api/admin/news/filters', verifyAdmin, async (req, res) => {
    try {
        const CMSService = require('./services/admin/cmsService');
        const cms = new CMSService(pool);
        const data = await cms.getFilterOptions();
        res.json(data);
    } catch (err) {
        console.error("Erro no /api/admin/news/filters:", err);
        res.status(500).json({ error: 'Erro ao buscar filtros.' });
    }
});

app.get('/api/admin/news', verifyAdmin, async (req, res) => {
    try {
        const CMSService = require('./services/admin/cmsService');
        const cms = new CMSService(pool);
        const data = await cms.getNewsList(req.query);
        res.json(data);
    } catch (err) {
        console.error("Erro no /api/admin/news:", err);
        res.status(500).json({ error: 'Erro ao carregar notícias.' });
    }
});

app.get('/api/admin/news/:id', verifyAdmin, async (req, res) => {
    try {
        const CMSService = require('./services/admin/cmsService');
        const cms = new CMSService(pool);
        const data = await cms.getNewsDetails(req.params.id);
        if (!data) return res.status(404).json({ error: 'Notícia não encontrada.' });
        res.json(data);
    } catch (err) {
        console.error("Erro no /api/admin/news/:id:", err);
        res.status(500).json({ error: 'Erro ao buscar detalhes da notícia.' });
    }
});

app.patch('/api/admin/news/:id/status', verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status obrigatório.' });
        
        const CMSService = require('./services/admin/cmsService');
        const cms = new CMSService(pool);
        await cms.updateNewsStatus(req.params.id, status);
        res.json({ message: 'Status atualizado com sucesso.' });
    } catch (err) {
        console.error("Erro no /api/admin/news/:id/status:", err);
        res.status(500).json({ error: 'Erro ao atualizar status.' });
    }
});

app.patch('/api/admin/news/:id/notes', verifyAdmin, async (req, res) => {
    try {
        const { editorial_summary, internal_note } = req.body;
        const CMSService = require('./services/admin/cmsService');
        const cms = new CMSService(pool);
        await cms.updateEditorialNotes(req.params.id, { editorial_summary, internal_note });
        res.json({ message: 'Notas editoriais atualizadas com sucesso.' });
    } catch (err) {
        console.error("Erro no /api/admin/news/:id/notes:", err);
        res.status(500).json({ error: 'Erro ao atualizar notas editoriais.' });
    }
});

// ========================
// PUBLIC ROUTES (Edições)
// ========================

app.get('/api/public/today-edition', async (req, res) => {
    try {
        const SelectionRepository = require('./repositories/selectionRepository');
        const selectionRepo = new SelectionRepository(pool);
        const items = await selectionRepo.getTodaySelections();
        const todayStr = new Date().toISOString().split('T')[0];
        
        let editionTitle = 'A Edição de Hoje';
        
        // Try to fetch real metadata
        const [editions] = await pool.execute('SELECT * FROM editions WHERE edition_date = ?', [todayStr]);
        if (editions.length > 0) {
            editionTitle = editions[0].title;
        }

        res.json({
            date: todayStr,
            editionTitle,
            items: items || []
        });
    } catch (err) {
        console.error("Erro no /api/public/today-edition:", err);
        res.status(500).json({ error: 'Erro ao buscar edição de hoje.' });
    }
});

app.get('/api/public/editions', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT e.*, COUNT(es.news_id) as newsCount 
            FROM editions e 
            LEFT JOIN edition_selections es ON e.edition_date = es.edition_date 
            GROUP BY e.id 
            ORDER BY e.edition_date DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error("Erro no /api/public/editions:", err);
        res.status(500).json({ error: 'Erro ao buscar lista de edições.' });
    }
});

app.get('/api/public/editions/:slug', async (req, res) => {
    try {
        const [editions] = await pool.execute('SELECT * FROM editions WHERE slug = ?', [req.params.slug]);
        if (editions.length === 0) return res.status(404).json({ error: 'Edição não encontrada.' });
        
        const edition = editions[0];
        
        const [items] = await pool.execute(`
            SELECT n.id, n.title, n.description, s.name as source_name, n.original_link, 
                   n.main_image, es.position, n.category, n.score
            FROM edition_selections es
            JOIN news_v2 n ON es.news_id = n.id
            LEFT JOIN news_sources s ON n.source_id = s.id
            WHERE es.edition_date = ?
            ORDER BY es.position ASC
        `, [edition.edition_date]);
        
        res.json({ edition, items });
    } catch (err) {
        console.error("Erro no /api/public/editions/:slug:", err);
        res.status(500).json({ error: 'Erro ao buscar edição.' });
    }
});

// ========================
// PUBLIC ROUTES (Categorias)
// ========================
app.get('/api/public/categories', async (req, res) => {
    try {
        const CategoryRepository = require('./repositories/categoryRepository');
        const catRepo = new CategoryRepository(pool);
        const categories = await catRepo.getCategoriesWithStats();
        res.json(categories);
    } catch (err) {
        console.error("Erro no /api/public/categories:", err);
        res.status(500).json({ error: 'Erro ao buscar categorias.' });
    }
});

app.post('/api/public/categories/reclassify', async (req, res) => {
    try {
        const CategoryRepository = require('./repositories/categoryRepository');
        const catRepo = new CategoryRepository(pool);
        const result = await catRepo.reclassifyAllNewsInDB();
        res.json({ success: true, message: 'Notícias reclassificadas com sucesso.', ...result });
    } catch (err) {
        console.error("Erro no /api/public/categories/reclassify:", err);
        res.status(500).json({ error: 'Erro ao reclassificar notícias.', details: err.message });
    }
});

app.get('/api/public/categories/:slug', async (req, res) => {
    try {
        const CategoryRepository = require('./repositories/categoryRepository');
        const catRepo = new CategoryRepository(pool);
        
        const categoryMeta = catRepo.getCategoryBySlug(req.params.slug);
        if (!categoryMeta) {
            return res.status(404).json({ error: 'Categoria não encontrada.' });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const sort = req.query.sort || 'score';
        
        const result = await catRepo.getNewsByCategory(req.params.slug, page, limit, sort);
        const sidebar = await catRepo.getSidebarData(req.params.slug);
        
        // Buscar a contagem total de artigos desta categoria
        const allCategories = await catRepo.getCategoriesWithStats();
        const currentStat = allCategories.find(c => c.slug === req.params.slug);
        const articleCount = currentStat ? currentStat.articleCount : result.pagination.total;

        res.json({
            category: {
                ...categoryMeta,
                articleCount
            },
            news: result.data,
            sidebar,
            pagination: result.pagination
        });
    } catch (err) {
        console.error(`[API] Erro crítico no /api/public/categories/${req.params.slug}:`, err);
        if (err.sqlMessage) console.error("[SQL Error]:", err.sqlMessage);
        res.status(500).json({ error: 'Erro interno ao buscar notícias da categoria.', details: err.message });
    }
});

// ========================
// SEO ROUTES (Sitemap e Robots)
// ========================
app.get('/robots.txt', (req, res) => {
    const PUBLIC_URL = process.env.PUBLIC_URL || 'https://techndevn.com';
    const content = `User-agent: *\nAllow: /\n\nSitemap: ${PUBLIC_URL}/sitemap.xml\n`;
    res.header('Content-Type', 'text/plain');
    res.send(content);
});

app.get('/sitemap.xml', async (req, res) => {
    try {
        const PUBLIC_URL = process.env.PUBLIC_URL || 'https://techndevn.com';
        
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        
        // Static URLs
        xml += `  <url>\n    <loc>${PUBLIC_URL}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
        xml += `  <url>\n    <loc>${PUBLIC_URL}/edicoes</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        
        // Categories
        const CategoryRepository = require('./repositories/categoryRepository');
        const catRepo = new CategoryRepository(pool);
        const categories = catRepo.getAllCategories();
        
        for (const cat of categories) {
            xml += `  <url>\n    <loc>${PUBLIC_URL}/categoria/${cat.slug}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
        }

        // Dynamic Editions
        const [editions] = await pool.query('SELECT slug, edition_date FROM editions ORDER BY edition_date DESC');
        for (const ed of editions) {
            const modDate = ed.edition_date instanceof Date ? ed.edition_date.toISOString().split('T')[0] : String(ed.edition_date).split('T')[0];
            xml += `  <url>\n    <loc>${PUBLIC_URL}/edicoes/${ed.slug}</loc>\n    <lastmod>${modDate}</lastmod>\n    <changefreq>never</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
        }
        
        xml += `</urlset>`;
        
        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        console.error('Error generating sitemap:', error);
        res.status(500).end();
    }
});

// ========================
// UNSUBSCRIBE ROUTES
// ========================

async function resolveSubscriberFromToken(token) {
    if (!token) return null;
    const cleanToken = String(token).trim();
    if (!cleanToken) return null;

    const SubscriberRepository = require('./repositories/subscriberRepository');
    const subscriberRepo = new SubscriberRepository(pool);

    // 1. Tenta buscar pelo token UUID direto do banco de dados (padrão único e permanente, NUNCA expira)
    try {
        const subscriber = await subscriberRepo.findByToken(cleanToken);
        if (subscriber) return subscriber;
    } catch (e) {
        console.error('[UNSUBSCRIBE] Erro ao buscar inscrito por token UUID:', e.message);
    }

    // 2. Se for um token legado (ex: JWT de e-mails antigos já disparados)
    // Decodifica sem validar expiração e sem checar assinatura (para não falhar por expiração ou alteração de JWT_SECRET)
    try {
        const decoded = jwt.decode(cleanToken);
        if (decoded && decoded.email) {
            const subscriber = await subscriberRepo.findByEmail(decoded.email);
            if (subscriber) return subscriber;
            return { email: decoded.email };
        }
    } catch (e) {
        console.error('[UNSUBSCRIBE] Erro ao decodificar token JWT legado:', e.message);
    }

    return null;
}

const renderUnsubscribeConfirmPage = (email, token, actionPath) => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Cancelar Inscrição - Techndevn Newsletter</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            .card { background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); padding: 40px 30px; max-width: 420px; text-align: center; }
            .logo { max-width: 120px; height: auto; margin-bottom: 24px; border-radius: 50%; border: 4px solid #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            h1 { color: #0f172a; font-size: 24px; margin-top: 0; font-weight: 800; letter-spacing: -0.5px; }
            p { color: #475569; font-size: 16px; margin-bottom: 30px; line-height: 1.6; }
            .btn { background-color: #dc2626; color: white; border: none; padding: 14px 24px; font-size: 16px; font-weight: bold; border-radius: 10px; cursor: pointer; text-decoration: none; display: inline-block; width: 100%; box-sizing: border-box; transition: background-color 0.2s; }
            .btn:hover { background-color: #b91c1c; }
            .cancel-link { display: block; margin-top: 20px; color: #64748b; text-decoration: none; font-size: 15px; font-weight: 500; transition: color 0.2s; }
            .cancel-link:hover { text-decoration: underline; color: #0f172a; }
        </style>
    </head>
    <body>
        <div class="card">
            <img src="https://raw.githubusercontent.com/mnogueiradev/Tech-e-Development-Newsletter/main/Tech-e-Development-Newsletter-main/public/image.png" alt="Techndevn Logo" class="logo">
            <h1>Que pena ver você partir...</h1>
            <p>Tem certeza que deseja cancelar sua inscrição e parar de receber nossa curadoria de notícias no e-mail <strong>${email}</strong>?</p>
            <form action="${actionPath}" method="POST">
                <input type="hidden" name="token" value="${token}">
                <input type="hidden" name="source" value="web">
                <button type="submit" class="btn">Sim, cancelar minha inscrição</button>
            </form>
            <a href="https://techndevn.com" class="cancel-link">Não, mudei de ideia!</a>
        </div>
    </body>
    </html>
`;

const renderUnsubscribeDonePage = (email) => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Inscrição Cancelada - Techndevn Newsletter</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            .card { background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); padding: 40px 30px; max-width: 420px; text-align: center; }
            .logo { max-width: 120px; height: auto; margin-bottom: 24px; border-radius: 50%; filter: grayscale(100%); opacity: 0.7; }
            h1 { color: #0f172a; font-size: 24px; margin-top: 0; font-weight: 800; letter-spacing: -0.5px; }
            p { color: #475569; font-size: 16px; margin-bottom: 30px; line-height: 1.6; }
            .btn { background-color: #2563eb; color: white; border: none; padding: 14px 24px; font-size: 16px; font-weight: bold; border-radius: 10px; cursor: pointer; text-decoration: none; display: inline-block; box-sizing: border-box; transition: background-color 0.2s; }
            .btn:hover { background-color: #1d4ed8; }
        </style>
    </head>
    <body>
        <div class="card">
            <img src="https://raw.githubusercontent.com/mnogueiradev/Tech-e-Development-Newsletter/main/Tech-e-Development-Newsletter-main/public/image.png" alt="Techndevn Logo" class="logo">
            <h1>Inscrição Cancelada</h1>
            <p>Você não receberá mais e-mails no endereço <strong>${email}</strong>.</p>
            <p style="font-size: 14px; color: #64748b;">Foi muito bom ter você com a gente. As portas estarão sempre abertas caso decida voltar!</p>
            <a href="https://techndevn.com" class="btn">Voltar para o site</a>
        </div>
    </body>
    </html>
`;

const renderUnsubscribeNotFoundPage = () => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Inscrição Já Cancelada ou Link Inválido - Techndevn Newsletter</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            .card { background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); padding: 40px 30px; max-width: 440px; text-align: center; }
            h1 { color: #0f172a; font-size: 22px; margin-top: 0; font-weight: 800; }
            p { color: #475569; font-size: 15px; margin-bottom: 24px; line-height: 1.6; }
            .btn { background-color: #2563eb; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>Inscrição já cancelada ou link inválido</h1>
            <p>Não encontramos uma inscrição ativa para este link. Se você já confirmou o cancelamento anteriormente, seu e-mail já foi removido da nossa lista.</p>
            <a href="https://techndevn.com" class="btn">Ir para o site</a>
        </div>
    </body>
    </html>
`;

const handleUnsubscribeGet = async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).send(renderUnsubscribeNotFoundPage());
        }

        const subscriber = await resolveSubscriberFromToken(token);
        if (!subscriber || !subscriber.email) {
            return res.status(400).send(renderUnsubscribeNotFoundPage());
        }

        // Renderiza a tela de confirmação (evita cancelamentos automáticos por leitores de anti-spam)
        const actionPath = req.originalUrl.split('?')[0];
        res.send(renderUnsubscribeConfirmPage(subscriber.email, token, actionPath));
    } catch (err) {
        console.error('[UNSUBSCRIBE] Erro no GET unsubscribe:', err);
        res.status(400).send(renderUnsubscribeNotFoundPage());
    }
};

const handleUnsubscribePost = async (req, res) => {
    try {
        const token = req.query.token || (req.body && req.body.token);
        const source = req.body && req.body.source;
        if (!token) return res.status(400).send('Token missing');

        const subscriber = await resolveSubscriberFromToken(token);
        if (!subscriber || !subscriber.email) {
            if (source === 'web') {
                return res.status(400).send(renderUnsubscribeNotFoundPage());
            }
            return res.status(400).send('Invalid token');
        }

        const email = subscriber.email;
        const SubscriberRepository = require('./repositories/subscriberRepository');
        const subscriberRepo = new SubscriberRepository(pool);
        await subscriberRepo.deleteByEmail(email);

        if (source === 'web') {
            return res.send(renderUnsubscribeDonePage(email));
        }

        res.status(200).send('Unsubscribed');
    } catch (err) {
        console.error('[UNSUBSCRIBE] Erro no POST unsubscribe:', err);
        if (req.body && req.body.source === 'web') {
            return res.status(400).send(renderUnsubscribeNotFoundPage());
        }
        res.status(400).send('Invalid token');
    }
};

app.get('/unsubscribe', handleUnsubscribeGet);
app.get('/api/unsubscribe', handleUnsubscribeGet);
app.post('/unsubscribe', handleUnsubscribePost);
app.post('/api/unsubscribe', handleUnsubscribePost);

// ========================
// 💬 FEEDBACK ROUTES
// ========================

app.get('/api/feedback', async (req, res) => {
    const { news, sub, vote } = req.query;

    if (!news || !sub || !vote || !['up', 'down'].includes(String(vote).toLowerCase())) {
        console.warn(`[FEEDBACK] ⚠️ Parâmetros inválidos: news=${news}, sub=${sub}, vote=${vote}`);
        return res.redirect('/feedback-erro');
    }

    try {
        const SubscriberRepository = require('./repositories/subscriberRepository');
        const NewsRepository = require('./repositories/newsRepository');
        const FeedbackRepository = require('./repositories/feedbackRepository');

        const subscriberRepo = new SubscriberRepository(pool);
        const newsRepo = new NewsRepository(pool);
        const feedbackRepo = new FeedbackRepository(pool);

        const subscriber = await subscriberRepo.findByToken(sub);
        if (!subscriber) {
            console.warn(`[FEEDBACK] ⚠️ Subscriber não encontrado para token: ${sub}`);
            return res.redirect('/feedback-erro');
        }

        const newsItem = await newsRepo.findById(news);
        if (!newsItem) {
            console.warn(`[FEEDBACK] ⚠️ Notícia não encontrada para ID: ${news}`);
            return res.redirect('/feedback-erro');
        }

        const normalizedVote = String(vote).toLowerCase();
        await feedbackRepo.upsertFeedback({
            newsId: Number(news),
            subscriberId: subscriber.id,
            vote: normalizedVote
        });

        console.log(`[FEEDBACK] ✅ Voto '${normalizedVote}' registrado para a notícia #${news} ("${newsItem.title}") pelo leitor ${subscriber.email}`);
        return res.redirect('/obrigado-feedback');
    } catch (err) {
        console.error(`[FEEDBACK] ❌ Erro ao computar voto:`, err.message);
        return res.redirect('/feedback-erro');
    }
});

app.get('/api/admin/feedback/stats', verifyAdmin, async (req, res) => {
    try {
        const FeedbackRepository = require('./repositories/feedbackRepository');
        const feedbackRepo = new FeedbackRepository(pool);

        const stats = await feedbackRepo.getFeedbackStats();
        const topRated = await feedbackRepo.getTopRatedNews(10);

        res.json({
            success: true,
            stats,
            topRated
        });
    } catch (err) {
        console.error("Erro no /api/admin/feedback/stats:", err);
        res.status(500).json({ error: 'Erro interno ao buscar estatísticas de feedback.' });
    }
});

// ========================
// ADMIN SELECTION ENGINE
// ========================

app.get('/api/admin/selection/generate', verifyAdmin, async (req, res) => {
    console.log("[API] /api/admin/selection/generate chamada.");
    try {
        const SelectionEngine = require('./services/selection/selectionEngine');
        const engine = new SelectionEngine(pool);
        // Gera seleção sem salvar (dryRun = true)
        const suggestions = await engine.runDailySelection(true);
        console.log(`[API] Seleção gerada com sucesso. Sugestões: ${suggestions ? suggestions.length : 0}`);
        
        // Validar que cada sugestão tem os campos necessários
        const validSuggestions = (suggestions || []).map(item => ({
            id: item.id,
            title: item.title || 'Título não disponível',
            description: item.description || '',
            source_name: item.source_name || 'Fonte Desconhecida',
            original_link: item.original_link || '#',
            score: item.score || 0,
            main_image: item.main_image || null,
            category: item.category || 'geral',
            publication_date: item.publication_date,
            selectionReason: item.selectionReason || 'Sugerida pelo algoritmo'
        }));
        
        console.log(`[API] Retornando ${validSuggestions.length} sugestões validadas`);
        res.json({ suggestions: validSuggestions });
    } catch (err) {
        console.error("Erro CRÍTICO ao gerar seleção:", err);
        console.error("Stack:", err.stack);
        res.status(500).json({ 
            error: 'Erro ao gerar seleção editorial.',
            details: err.message,
            message: 'Verifique se há notícias coletadas no banco de dados. Clique em "Coletar Notícias" primeiro.',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

app.post('/api/admin/selection/save', verifyAdmin, async (req, res) => {
    try {
        const { selection } = req.body;
        if (!selection || !Array.isArray(selection) || selection.length === 0) {
            return res.status(400).json({ error: 'Seleção inválida.' });
        }
        
        // Validar que cada item tem um ID
        for (const item of selection) {
            if (!item.id) {
                return res.status(400).json({ error: 'Todas as notícias devem ter um ID válido.' });
            }
        }
        
        const SelectionRepository = require('./repositories/selectionRepository');
        const selectionRepo = new SelectionRepository(pool);
        
        // Salva a nova seleção configurada manualmente pelo usuário
        // A função saveSelections já faz o DELETE internamente
        await selectionRepo.saveSelections(selection, 'manual_override_v1');
        
        console.log(`[API] ✅ Edição salva com sucesso. ${selection.length} notícias registradas.`);
        res.json({ message: 'Edição salva com sucesso.', count: selection.length });
    } catch (err) {
        console.error("Erro ao salvar seleção:", err);
        console.error("Stack:", err.stack);
        res.status(500).json({ error: 'Erro ao salvar edição.', details: err.message });
    }
});

// ========================
// NEWS FETCHING LOGIC (LEGACY REMOVED)
// ========================

// ========================
// 📰 NEWS FETCHING
// =======================

function buildEmailHtml(newsBR, topic = 'tecnologia') {
    const escapeHtml = (unsafe) => {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    const renderNewsItem = (item) => {
        const newsId = Number(item.id);
        const feedbackButtons = Number.isSafeInteger(newsId) && newsId > 0 ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; margin-top: 16px; border-collapse: separate;">
                <tr>
                    <td width="50%" valign="middle" style="width: 50%; padding: 0 4px 0 0;">
                        <a href="{{PUBLIC_URL}}/api/feedback?news=${newsId}&amp;sub={{SUBSCRIBER_TOKEN}}&amp;vote=up" aria-label="Gostei desta notícia" style="display: block; box-sizing: border-box; width: 100%; border: 1px solid #bbf7d0; border-radius: 8px; background-color: #f0fdf4; color: #166534; font-size: 13px; font-weight: 700; line-height: 18px; padding: 10px 6px; text-align: center; text-decoration: none;">
                            👍 Gostei
                        </a>
                    </td>
                    <td width="50%" valign="middle" style="width: 50%; padding: 0 0 0 4px;">
                        <a href="{{PUBLIC_URL}}/api/feedback?news=${newsId}&amp;sub={{SUBSCRIBER_TOKEN}}&amp;vote=down" aria-label="Não gostei desta notícia" style="display: block; box-sizing: border-box; width: 100%; border: 1px solid #fecaca; border-radius: 8px; background-color: #fef2f2; color: #b91c1c; font-size: 13px; font-weight: 700; line-height: 18px; padding: 10px 6px; text-align: center; text-decoration: none;">
                            👎 Não gostei
                        </a>
                    </td>
                </tr>
            </table>
        ` : '';

        return `
        <div style="margin-bottom: 30px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            ${item.image ? `<a href="${item.link}" target="_blank" style="display: block; text-decoration: none;"><img src="${item.image}" alt="Imagem da notícia" style="width: 100%; height: 200px; object-fit: cover; display: block; border-bottom: 1px solid #e2e8f0;" onerror="this.onerror=null; this.src='https://raw.githubusercontent.com/mnogueiradev/Tech-e-Development-Newsletter/main/Banner.png';"></a>` : ''}
            <div class="news-copy" style="padding: 24px;">
                <h3 class="news-title" style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.4;">
                    <a href="${item.link}" target="_blank" style="color: #0f172a; text-decoration: none;">${escapeHtml(item.title)}</a>
                </h3>
                ${item.description ? `<p style="margin: 0 0 20px 0; font-size: 15px; color: #475569; line-height: 1.6;">${escapeHtml(item.description)}</p>` : ''}
                <p class="news-source" style="margin: 16px 0 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                    ${escapeHtml(item.source)}
                </p>
                ${feedbackButtons}
            </div>
        </div>
        `;
    };

    return `
    <style type="text/css">
        @media only screen and (max-width: 600px) {
            .email-outer { padding: 16px 8px !important; }
            .email-content { padding: 24px 16px !important; }
            .news-copy { padding: 18px !important; }
            .news-title { font-size: 18px !important; line-height: 1.35 !important; }
        }
    </style>
    <div class="email-outer" style="background-color: #f8fafc; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            
            <!-- Banner Header -->
            <div style="background-color: #1e293b; text-align: center;">
                <img src="https://raw.githubusercontent.com/mnogueiradev/Tech-e-Development-Newsletter/main/Banner.gif" alt="Newsletter Banner" style="width: 100%; max-width: 600px; height: auto; display: block;">
            </div>

            <div class="email-content" style="padding: 40px 30px; background-color: #f8fafc;">
                <h2 style="color: #0f172a; text-align: center; margin-top: 0; margin-bottom: 8px; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${topic === 'financas' ? 'Sua Dose de Finanças' : 'Sua Dose de Tecnologia'}</h2>
                <p style="text-align: center; color: #64748b; margin-bottom: 40px; font-size: 16px;">Aqui estão as notícias mais quentes de hoje, curadas para você.</p>

                ${newsBR.map(renderNewsItem).join('')}
            </div>
            
            <div style="background-color: #ffffff; padding: 30px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">Enviado com ❤️ por <strong>${FROM_EMAIL}</strong></p>
                <p style="margin: 0 0 10px 0; font-size: 13px; color: #64748b;">Deseja parar de receber nossos e-mails? <a href="{{UNSUBSCRIBE_URL}}" style="color: #2563eb; text-decoration: underline;">Cancele sua inscri&ccedil;&atilde;o aqui</a>.</p>
                <p style="margin: 0; font-size: 12px; color: #94a3b8;">© ${new Date().getFullYear()} Techndevn Newsletter. Todos os direitos reservados.</p>
            </div>
        </div>
    </div>
    `;
}

async function getNewsletterItems(topic) {
    const SelectionRepository = require('./repositories/selectionRepository');
    const SelectionEngine = require('./services/selection/selectionEngine');
    const selectionRepo = new SelectionRepository(pool);
    
    const { classifyAdvertisement } = require('./services/adDetector');
    const filterAdvertisements = (items, context) => (items || []).filter(item => {
        const decision = classifyAdvertisement(item);
        if (decision.isAdvertisement) {
            console.log(`[NEWSLETTER] Conteúdo promocional removido (${context}): ${item.title} — ${decision.reasons.join(', ')}`);
            return false;
        }
        return true;
    });

    let rawItems = await selectionRepo.getTodaySelections();
    const savedSelectionCount = (rawItems || []).length;
    rawItems = filterAdvertisements(rawItems, 'seleção existente');

    // Gera ou atualiza a seleção se ainda não existir ou se a seleção salva continha anúncios.
    if (rawItems.length === 0 || rawItems.length < savedSelectionCount) {
        console.log('[NEWSLETTER] Gerando uma seleção sem conteúdo promocional...');
        const engine = new SelectionEngine(pool);
        rawItems = filterAdvertisements(await engine.runDailySelection(false), 'nova seleção');
    }
    
    let filteredItems = rawItems;
    if (topic && topic !== 'tecnologia') {
        filteredItems = rawItems.filter(item => item.category && item.category.toLowerCase().includes(topic.toLowerCase()));
        
        if (filteredItems.length === 0) {
            console.log(`[NEWSLETTER] Nenhuma notícia encontrada para o tópico ${topic}. Buscando do repositório...`);
            const NewsRepository = require('./repositories/newsRepository');
            const newsRepo = new NewsRepository(pool);
            const fallback = filterAdvertisements(await newsRepo.getTopNews(100), 'fallback');
            filteredItems = fallback.filter(item => item.category && item.category.toLowerCase().includes(topic.toLowerCase()));
        }
    }
    
    return filteredItems.slice(0, 9).map(item => ({
        id: item.id || item.news_id,
        title: item.title,
        link: item.original_link || item.link || '#',
        description: item.description || '',
        image: item.main_image || item.image || null,
        source: item.source_name || item.source || 'Fonte Desconhecida'
    }));
}

async function processAndSendNewsletter(tz = null) {
    console.log(`Iniciando processamento da newsletter diária${tz ? ` para o fuso ${tz}` : ''}...`);

    // Resumo do envio — sempre retornado ao final (nunca relança exceção)
    const resumo = { sent: 0, failed: 0, topics: [], errors: [] };

    // 3. Buscar inscritos
    try {
        let query = `SELECT email, topic, token FROM subscribers`;
        let params = [];
        if (tz) {
            query += ` WHERE timezone = ?`;
            params.push(tz);
        }
        const [rows] = await pool.query(query, params);

        if (rows.length === 0) {
            console.log('Nenhum inscrito para este fuso horário. Nenhuma notícia enviada.');
        }

        // Agrupa os inscritos pelo tópico escolhido
        const subscribersByTopic = rows.reduce((acc, row) => {
            const t = row.topic || 'tecnologia';
            if (!acc[t]) acc[t] = [];
            acc[t].push(row);
            return acc;
        }, {});

        for (const [topic, subscribers] of Object.entries(subscribersByTopic)) {
            const topicResumo = { topic, inscritos: subscribers.length, sent: 0, failed: 0 };
            resumo.topics.push(topicResumo);

            try {
                const emails = subscribers.map(s => s.email);
                console.log(`Processando tópico '${topic}' para ${subscribers.length} inscrito(s): ${emails.join(', ')}`);

                // Obter notícias do banco de dados (V2)
                let newsBR = await getNewsletterItems(topic);

                console.log(`📰 Notícias preparadas para '${topic}': ${newsBR.length} itens`);

                if (!newsBR || newsBR.length === 0) {
                    // Nunca enviar e-mail vazio: aborta só este tópico e segue para o próximo
                    const aviso = `[NEWSLETTER] ⚠️ 0 notícias para o tópico ${topic} — envio abortado para este tópico`;
                    console.log(aviso);
                    resumo.errors.push(aviso);
                    continue;
                }

                newsBR = await translateNewsItems(newsBR);

                const htmlContent = buildEmailHtml(newsBR, topic);

                // Envia individualmente para cada inscrito ver seu próprio email no campo "To"
                console.log('Enviando newsletters com FROM=', FROM_EMAIL);
                const PUBLIC_URL = process.env.PUBLIC_URL || 'https://techndevn.com';

                // Envio SEQUENCIAL (um inscrito por vez) para respeitar o rate limit do Resend (10 req/s)
                const results = [];
                for (let i = 0; i < subscribers.length; i++) {
                    const sub = subscribers[i];
                    let subToken = sub.token;
                    if (!subToken) {
                        subToken = randomUUID();
                        try {
                            await pool.execute('UPDATE subscribers SET token = ? WHERE email = ?', [subToken, sub.email]);
                            sub.token = subToken;
                        } catch (tokenErr) {
                            console.error('[NEWSLETTER] Erro ao persistir token UUID permanente:', sub.email, tokenErr);
                        }
                    }
                    const userUnsubscribeUrl = `${PUBLIC_URL}/unsubscribe?token=${subToken}`;
                    const userHtmlContent = htmlContent
                        .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, userUnsubscribeUrl)
                        .replace(/\{\{PUBLIC_URL\}\}/g, PUBLIC_URL)
                        .replace(/\{\{SUBSCRIBER_TOKEN\}\}/g, subToken);

                    const result = await sendEmail({
                        to: sub.email,
                        subject: `${topic === 'financas' ? 'Techndevn Finanças' : 'Techndevn'}: As 9 principais notícias do dia (${new Date().toLocaleDateString('pt-BR')})`,
                        html: userHtmlContent
                    });

                    results.push({ status: 'fulfilled', value: result });

                    // Aguarda 600ms entre cada envio
                    await new Promise(r => setTimeout(r, 600));
                }

                results.forEach((r, i) => {
                    const toEmail = emails[i];
                    if (r.status === 'fulfilled' && r.value.success) {
                        console.log(`Enviado para ${toEmail} com ID: ${r.value.id}`);
                    } else {
                        console.error(`Falha ao enviar para ${toEmail}:`, r.reason || (r.value && r.value.error) || 'Erro desconhecido');
                    }
                });

                const failed = results.filter(r => r.status === 'rejected' || (r.value && !r.value.success));
                topicResumo.sent = results.length - failed.length;
                topicResumo.failed = failed.length;
                resumo.sent += topicResumo.sent;
                resumo.failed += topicResumo.failed;

                if (failed.length > 0) {
                    console.error(`Erro ao enviar newsletter '${topic}' para ${failed.length} inscritos.`);
                } else {
                    console.log(`Newsletter '${topic}' enviada com sucesso para ${emails.length} inscritos!`);
                }
            } catch (err) {
                // Uma falha no tópico não pode abortar os demais tópicos
                console.error(`Erro ao processar o tópico '${topic}':`, err);
                resumo.errors.push(`Tópico '${topic}': ${err && err.message ? err.message : err}`);
            }
        }
    } catch (err) {
        console.error('Erro ao buscar inscritos e processar newsletter:', err);
        resumo.errors.push(`Erro ao buscar inscritos e processar newsletter: ${err && err.message ? err.message : err}`);
    }

    console.log('[NEWSLETTER-RESUMO] ' + JSON.stringify(resumo));
    return resumo;
}

async function sendWelcomeNewsletter(email, topic = 'tecnologia') {
    console.log(`📨 Enviando newsletter de boas-vindas para: ${email}`);

    try {
        // Obter notícias do banco de dados (V2)
        let newsBR = await getNewsletterItems(topic);

        console.log(`📰 Notícias preparadas para '${topic}': ${newsBR.length} itens`);

        newsBR = await translateNewsItems(newsBR);

        const htmlContent = buildEmailHtml(newsBR, topic);

        const PUBLIC_URL = process.env.PUBLIC_URL || 'https://techndevn.com';
        const SubscriberRepository = require('./repositories/subscriberRepository');
        const subscriberRepo = new SubscriberRepository(pool);
        const sub = await subscriberRepo.findByEmail(email);
        let subToken = sub ? sub.token : null;
        if (!subToken) {
            subToken = randomUUID();
            if (sub) {
                try {
                    await subscriberRepo.updateToken(email, subToken);
                    sub.token = subToken;
                } catch (tokenErr) {
                    console.error('[WELCOME] Erro ao persistir token UUID permanente:', email, tokenErr);
                }
            }
        }

        const userUnsubscribeUrl = `${PUBLIC_URL}/unsubscribe?token=${subToken}`;
        const userHtmlContent = htmlContent
            .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, userUnsubscribeUrl)
            .replace(/\{\{PUBLIC_URL\}\}/g, PUBLIC_URL)
            .replace(/\{\{SUBSCRIBER_TOKEN\}\}/g, subToken);

        // Envia email usando Resend
        const sendResult = await sendEmail({
            to: email,
            subject: 'Bem-vindo(a) ao Techndevn Newsletter!',
            html: userHtmlContent
        });

        if (!sendResult.success) {
            console.error("❌ Erro ao enviar email de boas-vindas:", sendResult.error);
            return false;
        }

        return true;

    } catch (error) {
        console.error("❌ Erro ao enviar email:", error);
        return false;
    }
}

// ========================
// ⏰ CRON
// =======================
const scheduledTimezones = new Set();

function scheduleCronForTimezone(tz) {
    if (scheduledTimezones.has(tz)) return;

    cron.schedule('0 8 * * *', () => {
        console.log(`⏰ Enviando newsletter (${tz})`);
        processAndSendNewsletter(tz);
    }, { timezone: tz });

    scheduledTimezones.add(tz);
}

async function loadSchedules() {
    if (!pool) return;
    try {
        const [rows] = await pool.query('SELECT DISTINCT timezone FROM subscribers WHERE timezone IS NOT NULL');
        const timezones = (rows || []).map(row => row.timezone).filter(tz => tz && tz.trim() !== '');

        if (timezones.length === 0) {
            console.error('[CRON] ⚠️ Nenhum timezone de inscrito encontrado — agendando fallback America/Sao_Paulo');
            scheduleCronForTimezone('America/Sao_Paulo');
            return;
        }

        timezones.forEach(tz => {
            scheduleCronForTimezone(tz);
        });
    } catch (err) {
        console.error('Erro ao carregar fusos horários do banco:', err.message);
        console.error('[CRON] ⚠️ Nenhum timezone de inscrito encontrado — agendando fallback America/Sao_Paulo');
        scheduleCronForTimezone('America/Sao_Paulo');
    }
}

// ========================
// START
// =======================
// Servir o Frontend construído e páginas estáticas da pasta public
const frontendPath = path.join(__dirname, 'newsletter-frontend', 'out');
const publicFrontendPath = path.join(__dirname, 'frontend', 'dist');
const publicPath = path.join(__dirname, 'public');

// Serve pasta public (para páginas de confirmação/erro, imagens, etc)
app.use(express.static(publicPath, { extensions: ['html'] }));
// Serve novo frontend primeiro (para homepage, assets, etc)
app.use(express.static(publicFrontendPath, { extensions: ['html'] }));
// Serve o antigo frontend como fallback (para assets do admin)
app.use(express.static(frontendPath, { extensions: ['html'] }));

// Rotas explícitas de feedback (evitam problemas de extensão .html)
app.get('/obrigado-feedback', (req, res) => res.sendFile(path.join(publicPath, 'obrigado-feedback.html')));
app.get('/obrigado-feedback.html', (req, res) => res.sendFile(path.join(publicPath, 'obrigado-feedback.html')));
app.get('/feedback-erro', (req, res) => res.sendFile(path.join(publicPath, 'feedback-erro.html')));
app.get('/feedback-erro.html', (req, res) => res.sendFile(path.join(publicPath, 'feedback-erro.html')));

// Rotas explícitas para garantir que pastas/subpastas com barra final não caiam no fallback SPA errado
app.get('/admin', (req, res) => res.sendFile(path.join(frontendPath, 'admin.html')));
app.get('/admin/', (req, res) => res.sendFile(path.join(frontendPath, 'admin.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(frontendPath, 'admin', 'login.html')));
app.get('/admin/login/', (req, res) => res.sendFile(path.join(frontendPath, 'admin', 'login.html')));
app.get('/admin/news', (req, res) => res.sendFile(path.join(frontendPath, 'admin', 'news.html')));
app.get('/admin/news/', (req, res) => res.sendFile(path.join(frontendPath, 'admin', 'news.html')));
app.get('/admin/selection', (req, res) => res.sendFile(path.join(frontendPath, 'admin', 'selection.html')));
app.get('/admin/selection/', (req, res) => res.sendFile(path.join(frontendPath, 'admin', 'selection.html')));

// Fallback SPA: Qualquer rota não reconhecida devolve o index.html do frontend (se existir)
app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/subscribe') || req.path.startsWith('/subscribers') || req.path.startsWith('/unsubscribe') || req.path.startsWith('/trigger-email') || req.path.startsWith('/api') || req.path.startsWith('/obrigado-feedback') || req.path.startsWith('/feedback-erro')) {
        return next();
    }
    
    if (require('fs').existsSync(path.join(publicFrontendPath, 'index.html'))) {
        res.sendFile(path.join(publicFrontendPath, 'index.html'));
    } else if (require('fs').existsSync(path.join(frontendPath, 'index.html'))) {
        res.sendFile(path.join(frontendPath, 'index.html'));
    } else {
        res.status(404).json({ error: 'Frontend não encontrado. Execute "npm run build" para gerar os arquivos da interface.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Rodando na porta ${PORT}`);
    console.log(`Acesse http://localhost:${PORT} para se inscrever.`);
    console.log(`Acesse http://localhost:${PORT}/api para health check.`);
    console.log(`Acesse http://localhost:${PORT}/trigger-email para forçar o envio da newsletter imediatamente.`);
});
