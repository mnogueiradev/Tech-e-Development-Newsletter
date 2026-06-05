require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const cron = require('node-cron');
const moment = require('moment-timezone');
const path = require('path');
const { Resend } = require('resend');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { initializeDatabase } = require('./repositories/dbInit');
const { initNewsScheduler, runNewsCollection } = require('./services/newsScheduler');
const jwt = require('jsonwebtoken');


const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

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

        setTimeout(() => { console.log('🔥 Iniciando disparo forçado de teste!'); processAndSendNewsletter(); }, 5000);
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
// NEWS FETCHING LOGIC
// ========================

// Função para buscar notícias específicas do Olhar Digital
async function fetchOlharDigitalNews(count = 1, topic = 'tecnologia') {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey || apiKey === 'COLOQUE_SUA_CHAVE_AQUI') {
        console.error('ERRO: Chave da API do Brave não configurada no .env');
        return [];
    }

    // Usa a query específica para cada tópico, e pede mais resultados para podermos filtrar os que têm imagem
    const topicQuery = topic === 'financas' ? 'finanças mercado' : 'tecnologia';
    const url = `https://api.search.brave.com/res/v1/news/search?q=site:olhardigital.com.br%20${encodeURIComponent(topicQuery)}&country=br&count=10&freshness=pd`;

    // Tenta até 3 vezes caso dê erro de "fetch failed" ou 429
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': apiKey
                }
            });

            if (!response.ok) {
                console.error(`Erro ao buscar notícias do Olhar Digital (tentativa ${attempt}): ${response.status} - ${response.statusText}`);
                if (response.status === 429) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue; // Tenta de novo se for Rate Limit
                }
                return [];
            }

            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                console.warn('Nenhuma notícia do Olhar Digital encontrada');
                return [];
            }

            console.log(`✅ Buscadas ${data.results.length} notícias do Olhar Digital (${topic})`);
            
            // Filtra as que têm imagem
            const withImage = data.results.filter(item => item.thumbnail && item.thumbnail.src);
            // Se não der o count, completa com as sem imagem
            let finalResults = withImage;
            if (finalResults.length < count) {
                const withoutImage = data.results.filter(item => !item.thumbnail || !item.thumbnail.src);
                finalResults = [...finalResults, ...withoutImage];
            }

            return finalResults.slice(0, count).map(item => ({
                title: item.title,
                link: item.url,
                description: item.description || '',
                image: (item.thumbnail && item.thumbnail.src) ? item.thumbnail.src : null,
                source: 'Olhar Digital'
            }));
        } catch (err) {
            console.error(`Erro ao buscar notícias do Olhar Digital (tentativa ${attempt}):`, err.message);
            if (attempt === 3) return [];
            await new Promise(r => setTimeout(r, 2000)); // Espera 2s antes de tentar de novo
        }
    }
    return [];
}

async function fetchFromBraveSearch(query, country, count = 3) {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey || apiKey === 'COLOQUE_SUA_CHAVE_AQUI') {
        console.error('ERRO: Chave da API do Brave não configurada no .env');
        return [{ title: 'Erro de Configuração API', link: '#', source: 'Sistema' }];
    }

    // Pede 20 resultados para garantir que acharemos o suficiente com imagens
    const url = `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}&country=${country}&count=20&freshness=pd`;

    // Tenta até 3 vezes caso dê erro de "fetch failed" ou 429
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': apiKey
                }
            });

            if (!response.ok) {
                console.error(`Erro na API do Brave (tentativa ${attempt}): ${response.status} - ${response.statusText}`);
                if (response.status === 429) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue; // Tenta de novo se for Rate Limit
                }
                return [];
            }

            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                console.warn(`Aviso: Nenhuma notícia retornada para ${country}. Resposta completa:`, JSON.stringify(data).substring(0, 500));
                return [];
            }

            console.log(`Buscado com sucesso: ${data.results.length} notícias para ${country}`);
            
            // Filtra as que têm imagem primeiro
            const withImage = data.results.filter(item => item.thumbnail && item.thumbnail.src);
            // Se não tiver o suficiente, completa com as sem imagem
            let finalResults = withImage;
            if (finalResults.length < count) {
                const withoutImage = data.results.filter(item => !item.thumbnail || !item.thumbnail.src);
                finalResults = [...finalResults, ...withoutImage];
            }

            return finalResults.slice(0, count).map(item => ({
                title: item.title,
                link: item.url,
                description: item.description || '',
                image: (item.thumbnail && item.thumbnail.src) ? item.thumbnail.src : null,
                source: (item.meta_url && item.meta_url.hostname) ? item.meta_url.hostname : 'Brave News'
            }));
        } catch (err) {
            console.error(`Erro ao buscar notícias do Brave para ${country} (tentativa ${attempt}):`, err.message);
            if (attempt === 3) return [];
            await new Promise(r => setTimeout(r, 2000)); // Espera 2s antes de tentar de novo
        }
    }
    return [];
}

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
        <div style="margin-bottom: 30px; padding: 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    ${item.image ? '<td width="120" valign="top" style="padding-right: 15px;"><img src="' + item.image + '" alt="Imagem da notícia" style="width: 120px; height: 80px; object-fit: cover; border-radius: 8px;" onerror="this.onerror=null; this.src=\'https://raw.githubusercontent.com/mnogueiradev/Tech-e-Development-Newsletter/main/Banner.png\';"></td>' : ''}
                    <td valign="top">
                        <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #000000; line-height: 1.3;">${escapeHtml(item.title)}</h3>
                        ${item.description ? '<p style="margin: 0 0 15px 0; font-size: 14px; color: #000000; line-height: 1.6;">' + escapeHtml(item.description) + '</p>' : ''}
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
                            <tr>
                                <td align="left" style="font-size: 12px; color: #000000;">
                                    Fonte: <strong>${escapeHtml(item.source)}</strong>
                                </td>
                                <td align="right">
                                    <a href="${item.link}" style="color: #000000; text-decoration: underline; font-size: 13px; font-weight: bold;">Ler na íntegra ➔</a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </div>
    `;

    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #000000;">
        <!-- Banner Header -->
        <div style="text-align: center; padding: 20px;">
            <img src="https://raw.githubusercontent.com/mnogueiradev/Tech-e-Development-Newsletter/main/Banner.png" alt="Newsletter Banner" style="max-width: 100%; height: auto; border-radius: 8px;">
        </div>

        <div style="padding: 30px;">
            <h2 style="color: #000000; text-align: center; margin-top: 0;">${topic === 'financas' ? 'Sua Dose Diária de Finanças' : 'Sua Dose Diária de Tecnologia'}</h2>
            <p style="text-align: center; color: #000000; margin-bottom: 30px;">Aqui estão as 9 notícias mais quentes de hoje, diretamente do Brasil.</p>

            <h2 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; color: #000000;">Notícias do Brasil</h2>
            ${newsBR.map(renderNewsItem).join('')}
        </div>

        <div style="padding: 20px; text-align: center; font-size: 12px; color: #000000;">
            <p>Enviado por nogmath185@gmail.com</p>
            <p>© ${new Date().getFullYear()} Tech & Development Newsletter. Todos os direitos reservados.</p>
        </div>
    </div>
    `;
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
            console.log(`Processando tópico '${topic}' para: ${emails.join(', ')}`);

            const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
            const queries = {
                tecnologia: 'tecnologia',
                financas: 'finanças mercado'
            };
            const q = queries[topic] || queries['tecnologia'];

            // Busca 1 notícia do Olhar Digital e 8 notícias gerais
            const [olharNews, generalNews] = await Promise.all([
                fetchOlharDigitalNews(1, topic),
                fetchFromBraveSearch(q, 'br', 8)
            ]);

            // Combina as notícias, garantindo que a do Olhar Digital venha primeiro
            const newsBR = [...olharNews, ...generalNews].slice(0, 9);

            console.log(`📰 Notícias combinadas: ${olharNews.length} do Olhar Digital, ${generalNews.length} gerais`);

            // 2. Montar HTML com o tópico correto
            const htmlContent = buildEmailHtml(newsBR, topic);

            const { data, error } = await resend.emails.send({
                from: 'newsletter@techndevn.com',
                to: ['newsletter@techndevn.com'],
                bcc: emails,
                subject: `${topic === 'financas' ? 'FinanceNews' : 'TechNews'}: As 9 principais notícias do dia (${new Date().toLocaleDateString('pt-BR')})`,
                html: htmlContent
            });

            if (error) {
                console.error(`Erro ao enviar newsletter '${topic}' via Resend:`, error);
            } else {
                console.log(`Newsletter '${topic}' enviada com sucesso! ID: ${data.id}`);
            }
        }
    } catch (err) {
        console.error('Erro ao buscar inscritos e processar newsletter:', err);
    }
}

async function sendWelcomeNewsletter(email, topic = 'tecnologia') {
    console.log(`📨 Enviando newsletter de boas-vindas para: ${email}`);

    try {
        const queries = {
            tecnologia: 'tecnologia',
            financas: 'finanças mercado'
        };

        const q = queries[topic] || queries['tecnologia'];

        // Busca 1 notícia do Olhar Digital e 8 notícias gerais
        const [olharNews, generalNews] = await Promise.all([
            fetchOlharDigitalNews(1, topic),
            fetchFromBraveSearch(q, 'br', 8)
        ]);

        // Combina as notícias, garantindo que a do Olhar Digital venha primeiro
        const newsBR = [...olharNews, ...generalNews].slice(0, 9);

        console.log(`📰 Notícias combinadas: ${olharNews.length} do Olhar Digital, ${generalNews.length} gerais`);

        const htmlContent = buildEmailHtml(newsBR, topic);

        // Envia email usando Resend
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: [email],
            subject: 'Bem-vindo(a) ao Tech & Development Newsletter!',
            html: htmlContent
        });

        if (error) {
            console.error("❌ Erro ao enviar email via Resend:", error);
            return false;
        }

        console.log("✅ Email enviado via Resend:", data.id);
        return true;

    } catch (error) {
        console.error("❌ Erro ao enviar email:", error);
        return false;
    }
}

// ========================
// ⏰ CRON
// =======================
async function loadSchedules() {
    if (!pool) return;

    // Agenda um único cron global que executa todo minuto 0 (uma vez por hora)
    cron.schedule('0 * * * *', async () => {
        console.log(`⏰ [CRON GLOBAL] Verificando envios... Hora do servidor: ${new Date().toISOString()}`);
        try {
            const [rows] = await pool.query('SELECT DISTINCT timezone FROM subscribers WHERE timezone IS NOT NULL');
            
            for (const row of rows) {
                const tz = row.timezone;
                try {
                    // Pega a hora atual usando moment-timezone
                    const currentHourInTz = moment().tz(tz).hour();
                    
                    // Se for 8h da manhã neste fuso, faz o envio
                    if (currentHourInTz === 8) {
                        console.log(`⏰ É 8h no fuso ${tz}. Disparando newsletter...`);
                        processAndSendNewsletter(tz);
                    }
                } catch (err) {
                    console.error(`Erro ao verificar hora para o fuso ${tz}:`, err.message);
                }
            }
        } catch (err) {
            console.error('Erro no cron global de verificação de fusos:', err.message);
        }
    });

    console.log('✅ Cron Global inicializado. Ele irá verificar os fusos horários toda hora.');
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
