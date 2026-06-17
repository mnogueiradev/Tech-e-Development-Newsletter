require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const { Resend } = require('resend');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { initializeDatabase } = require('./repositories/dbInit');
const { initNewsScheduler, runNewsCollection } = require('./services/newsScheduler');
const { translateNewsItems, isBrazilianSource } = require('./services/newsTranslation');
const jwt = require('jsonwebtoken');


const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);
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
app.use('/Banner.png', express.static(path.join(__dirname, 'Banner.png')));

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
// 📧 EMAIL (Resend apenas)
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
    res.json({ status: 'ok', message: 'API Tech & Development Newsletter rodando!' });
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

    try {
        await safeExecute(
            `INSERT INTO subscribers (email, timezone, topic) VALUES (?, ?, ?)`,
            [email, userTZ, userTopic]
        );

        console.log(" Salvo no DB");

        const emailSent = await sendWelcomeNewsletter(email, userTopic);

        if (!emailSent) {
            // Se falhou ao enviar o email, deletamos do banco para não ficar "preso"
            await safeExecute(`DELETE FROM subscribers WHERE email = ?`, [email]);
            return res.status(500).json({
                error: "Falha ao enviar email de confirmação. O Resend pode ter bloqueado (verifique os logs ou se usou um email não autorizado no sandbox)."
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
        await processAndSendNewsletter();
        res.json({ message: 'Newsletter processada e enviada com sucesso! Verifique o console.' });
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
// UNSUBSCRIBE ROUTES
// ========================

app.get('/api/unsubscribe', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send('<h1>Link inv&aacute;lido ou expirado.</h1>');

        const decoded = jwt.verify(token, JWT_SECRET);
        const email = decoded.email;

        await safeExecute(`DELETE FROM subscribers WHERE email = ?`, [email]);

        res.send(`
            <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 20px;">
                <h1 style="color: #333;">Inscri&ccedil;&atilde;o cancelada</h1>
                <p style="color: #666; font-size: 16px;">Voc&ecirc; n&atilde;o receber&aacute; mais nossos e-mails no endere&ccedil;o <strong>${email}</strong>.</p>
            </div>
        `);
    } catch (err) {
        res.status(400).send('<h1>Link inv&aacute;lido ou expirado.</h1>');
    }
});

app.post('/api/unsubscribe', async (req, res) => {
    try {
        const token = req.query.token || req.body.token;
        if (!token) return res.status(400).send('Token missing');

        const decoded = jwt.verify(token, JWT_SECRET);
        const email = decoded.email;

        await safeExecute(`DELETE FROM subscribers WHERE email = ?`, [email]);
        
        res.status(200).send('Unsubscribed');
    } catch (err) {
        res.status(400).send('Invalid token');
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

    const renderNewsItem = (item) => `
        <div style="margin-bottom: 30px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            ${item.image ? `<a href="${item.link}" target="_blank" style="display: block; text-decoration: none;"><img src="${item.image}" alt="Imagem da notícia" style="width: 100%; height: 200px; object-fit: cover; display: block; border-bottom: 1px solid #e2e8f0;" onerror="this.onerror=null; this.src='https://raw.githubusercontent.com/mnogueiradev/Tech-e-Development-Newsletter/main/Banner.png';"></a>` : ''}
            <div style="padding: 24px;">
                <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.4;">
                    <a href="${item.link}" target="_blank" style="color: #0f172a; text-decoration: none;">${escapeHtml(item.title)}</a>
                </h3>
                ${item.description ? `<p style="margin: 0 0 20px 0; font-size: 15px; color: #475569; line-height: 1.6;">${escapeHtml(item.description)}</p>` : ''}
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px;">
                    <tr>
                        <td align="left" valign="middle" style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            ${escapeHtml(item.source)}
                        </td>
                        <td align="right" valign="middle">
                            <a href="${item.link}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 6px;">Ler mais</a>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
    `;

    return `
    <div style="background-color: #f8fafc; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            
            <!-- Banner Header -->
            <div style="background-color: #1e293b; text-align: center;">
                <img src="https://raw.githubusercontent.com/mnogueiradev/Tech-e-Development-Newsletter/main/Banner.png" alt="Newsletter Banner" style="width: 100%; max-width: 600px; height: auto; display: block;">
            </div>

            <div style="padding: 40px 30px; background-color: #f8fafc;">
                <h2 style="color: #0f172a; text-align: center; margin-top: 0; margin-bottom: 8px; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${topic === 'financas' ? 'Sua Dose de Finanças' : 'Sua Dose de Tecnologia'}</h2>
                <p style="text-align: center; color: #64748b; margin-bottom: 40px; font-size: 16px;">Aqui estão as notícias mais quentes de hoje, curadas para você.</p>

                ${newsBR.map(renderNewsItem).join('')}
            </div>
            
            <div style="background-color: #ffffff; padding: 30px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">Enviado com ❤️ por <strong>${FROM_EMAIL}</strong></p>
                <p style="margin: 0 0 10px 0; font-size: 13px; color: #64748b;">Deseja parar de receber nossos e-mails? <a href="{{UNSUBSCRIBE_URL}}" style="color: #2563eb; text-decoration: underline;">Cancele sua inscri&ccedil;&atilde;o aqui</a>.</p>
                <p style="margin: 0; font-size: 12px; color: #94a3b8;">© ${new Date().getFullYear()} Tech & Development Newsletter. Todos os direitos reservados.</p>
            </div>
        </div>
    </div>
    `;
}

async function getNewsletterItems(topic) {
    const SelectionRepository = require('./repositories/selectionRepository');
    const SelectionEngine = require('./services/selection/selectionEngine');
    const selectionRepo = new SelectionRepository(pool);
    
    let rawItems = await selectionRepo.getTodaySelections();
    
    // Se não houver seleção gerada hoje
    if (!rawItems || rawItems.length === 0) {
        console.log('[NEWSLETTER] Nenhuma seleção encontrada para hoje. Gerando automaticamente...');
        const engine = new SelectionEngine(pool);
        rawItems = await engine.runDailySelection(false); 
    }
    
    let filteredItems = rawItems;
    if (topic && topic !== 'tecnologia') {
        filteredItems = rawItems.filter(item => item.category && item.category.toLowerCase().includes(topic.toLowerCase()));
        
        if (filteredItems.length === 0) {
            console.log(`[NEWSLETTER] Nenhuma notícia encontrada para o tópico ${topic}. Buscando do repositório...`);
            const NewsRepository = require('./repositories/newsRepository');
            const newsRepo = new NewsRepository(pool);
            const fallback = await newsRepo.getTopNews(30);
            filteredItems = fallback.filter(item => item.category && item.category.toLowerCase().includes(topic.toLowerCase()));
        }
    }
    
    return filteredItems.slice(0, 9).map(item => ({
        title: item.title,
        link: item.original_link || item.link || '#',
        description: item.description || '',
        image: item.main_image || item.image || null,
        source: item.source_name || item.source || 'Fonte Desconhecida'
    }));
}

async function processAndSendNewsletter(tz = null) {
    console.log(`Iniciando processamento da newsletter diária${tz ? ` para o fuso ${tz}` : ''}...`);

    // 3. Buscar inscritos
    try {
        let query = `SELECT email, topic FROM subscribers`;
        let params = [];
        if (tz) {
            query += ` WHERE timezone = ?`;
            params.push(tz);
        }
        const [rows] = await pool.query(query, params);

        if (rows.length === 0) {
            console.log('Nenhum inscrito para este fuso horário. Nenhuma notícia enviada.');
            return;
        }

        // Agrupa os emails pelo tópico escolhido
        const subscribersByTopic = rows.reduce((acc, row) => {
            const t = row.topic || 'tecnologia';
            if (!acc[t]) acc[t] = [];
            acc[t].push(row.email);
            return acc;
        }, {});

        for (const [topic, emails] of Object.entries(subscribersByTopic)) {
            console.log(`Processando tópico '${topic}' para ${emails.length} inscrito(s): ${emails.join(', ')}`);

            // Obter notícias do banco de dados (V2)
            let newsBR = await getNewsletterItems(topic);

            console.log(`📰 Notícias preparadas para '${topic}': ${newsBR.length} itens`);

            newsBR = await translateNewsItems(newsBR);

            const htmlContent = buildEmailHtml(newsBR, topic);

            // Envia individualmente para cada inscrito ver seu próprio email no campo "To"
            console.log('Enviando newsletters com FROM=', FROM_EMAIL);
            const PUBLIC_URL = process.env.PUBLIC_URL || 'https://techndevn.com';
            
            const sendPromises = emails.map(email => {
                const token = jwt.sign({ email }, JWT_SECRET);
                const userUnsubscribeUrl = `${PUBLIC_URL}/api/unsubscribe?token=${token}`;
                const userHtmlContent = htmlContent.replace('{{UNSUBSCRIBE_URL}}', userUnsubscribeUrl);

                return resend.emails.send({
                    from: FROM_EMAIL,
                    to: email,
                    subject: `${topic === 'financas' ? 'FinanceNews' : 'TechNews'}: As 9 principais notícias do dia (${new Date().toLocaleDateString('pt-BR')})`,
                    html: userHtmlContent,
                    headers: {
                        'List-Unsubscribe': `<${userUnsubscribeUrl}>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                    }
                });
            });

            const results = await Promise.allSettled(sendPromises);

            results.forEach((r, i) => {
                const toEmail = emails[i];
                if (r.status === 'fulfilled') {
                    console.log(`Enviado para ${toEmail}:`, r.value);
                } else {
                    console.error(`Falha ao enviar para ${toEmail}:`, r.reason || r);
                }
            });

            const failed = results.filter(r => r.status === 'rejected' || (r.value && r.value.error));
            if (failed.length > 0) {
                console.error(`Erro ao enviar newsletter '${topic}' para ${failed.length} inscritos.`);
            } else {
                console.log(`Newsletter '${topic}' enviada com sucesso para ${emails.length} inscritos!`);
            }
        }
    } catch (err) {
        console.error('Erro ao buscar inscritos e processar newsletter:', err);
    }
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
        const token = jwt.sign({ email }, JWT_SECRET);
        const userUnsubscribeUrl = `${PUBLIC_URL}/api/unsubscribe?token=${token}`;
        const userHtmlContent = htmlContent.replace('{{UNSUBSCRIBE_URL}}', userUnsubscribeUrl);

        // Envia email usando Resend
        const sendResult = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: 'Bem-vindo(a) ao Tech & Development Newsletter!',
            html: userHtmlContent,
            headers: {
                'List-Unsubscribe': `<${userUnsubscribeUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            }
        });

        console.log('Resend sendWelcome response:', sendResult);

        if (sendResult.error) {
            console.error("❌ Erro ao enviar email via Resend:", sendResult.error);
            return false;
        }

        // Log id if available
        if (sendResult && (sendResult.id || sendResult.messageId)) {
            console.log("✅ Email enviado via Resend:", sendResult.id || sendResult.messageId);
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
        rows.forEach(row => {
            scheduleCronForTimezone(row.timezone);
        });
    } catch (err) {
        console.error('Erro ao carregar fusos horários do banco:', err.message);
    }
}

// ========================
// START
// =======================
// Servir o Frontend construído (apenas no Render/Produção)
const frontendPath = path.join(__dirname, 'newsletter-frontend', 'out');
app.use(express.static(frontendPath, { extensions: ['html'] }));

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
    if (req.path.startsWith('/subscribe') || req.path.startsWith('/subscribers') || req.path.startsWith('/trigger-email') || req.path.startsWith('/api')) {
        return next();
    }
    
    if (require('fs').existsSync(path.join(frontendPath, 'index.html'))) {
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
