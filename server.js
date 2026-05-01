require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const path = require('path');
const { Resend } = require('resend');


const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/Banner.png', express.static(path.join(__dirname, 'Banner.png')));

// Serve o frontend Next.js (static export) se existir
try {
    const fs = require('fs');
    if (fs.existsSync(path.join(__dirname, 'frontend', 'out'))) {
        app.use(express.static(path.join(__dirname, 'frontend', 'out')));
    }
} catch (e) {}

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
// 📧 EMAIL
// ========================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

transporter.verify((err) => {
    if (err) console.error("Erro email:", err);
    else console.log("✅ Email pronto");
});

// ========================
// 🚀 ROUTES
// =======================


// Rota de health check para o Render detectar o serviço
app.get('/api', (req, res) => {
    res.json({ status: 'ok', message: 'API Tech & Development Newsletter rodando!' });
});

app.post('/subscribe', async (req, res) => {
    console.log("🧠 BODY COMPLETO:", req.body);

    const { email, timezone, topic } = req.body;

    console.log("📩 Novo subscribe:", email);

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Email inválido.' });
    }

    const userTZ = timezone || 'America/Sao_Paulo';
    const userTopic = topic || 'tecnologia';

    try {
        await safeExecute(
            `INSERT INTO subscribers (email, timezone, topic) VALUES (?, ?, ?)`,
            [email, userTZ, userTopic]
        );

        console.log("✅ Salvo no DB");

        await sendWelcomeNewsletter(email, userTopic);

        scheduleCronForTimezone(userTZ);

        res.json({ success: true });

    } catch (err) {
        console.error("❌ Erro subscribe:", err);

        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Este email já está inscrito!' });
        }

        res.status(500).json({ error: 'Erro interno ao salvar email.' });
    }
});

app.get('/subscribers', async (req, res) => {
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

app.get('/trigger-email', async (req, res) => {
    try {
        await processAndSendNewsletter();
        res.send('Newsletter processada e enviada com sucesso! Verifique o console.');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao enviar newsletter: ' + err.message);
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

    // Usa a query específica para cada tópico
    const topicQuery = topic === 'financas' ? 'finanças mercado' : 'tecnologia';
    const url = `https://api.search.brave.com/res/v1/news/search?q=site:olhardigital.com.br%20${encodeURIComponent(topicQuery)}&country=br&count=${count}&freshness=pd`;

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
            return data.results.slice(0, count).map(item => ({
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

    const url = `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}&country=${country}&count=${count}&freshness=pd`;

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
            return data.results.slice(0, count).map(item => ({
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
                    ${item.image ? '<td width="120" valign="top" style="padding-right: 15px;"><img src="' + item.image + '" alt="Imagem da notícia" style="width: 120px; height: 80px; object-fit: cover; border-radius: 8px;"></td>' : ''}
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
            <img src="cid:banner" alt="Newsletter Banner" style="max-width: 100%; height: auto; border-radius: 8px;">
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
            const bccEmails = emails.join(', ');
            console.log(`Processando tópico '${topic}' para: ${bccEmails}`);

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

            // 4. Enviar email usando nodemailer
            const mailOptions = {
                from: `"Tech & Development Newsletter" <${process.env.GMAIL_USER}>`,
                bcc: bccEmails,
                subject: `${topic === 'financas' ? 'FinanceNews' : 'TechNews'}: As 9 principais notícias do dia (${new Date().toLocaleDateString('pt-BR')})`,
                html: htmlContent,
                attachments: [{
                    filename: 'Banner.png',
                    path: path.join(__dirname, 'Banner.png'),
                    cid: 'banner'
                }]
            };

            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`Newsletter '${topic}' enviada com sucesso! ID: ${info.messageId}`);
            } catch (error) {
                console.error(`Erro ao enviar newsletter '${topic}':`, error);
                console.log('DICA: Você configurou sua Senha de App do Gmail corretamente?');
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

        const mailOptions = {
            from: `"Tech & Development Newsletter" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: `Bem-vindo(a) ao Tech & Development Newsletter!`,
            html: htmlContent,
            attachments: [{
                filename: 'Banner.png',
                path: path.join(__dirname, 'Banner.png'),
                cid: 'banner'
            }]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Email enviado:", info.messageId);

    } catch (error) {
        console.error("❌ Erro ao enviar email:", error);
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
// Fallback SPA: serve frontend Next.js na rota raiz
app.get('*', (req, res, next) => {
    // Se for rota de API, continua normal
    if (req.path.startsWith('/subscribe') || req.path.startsWith('/subscribers') || req.path.startsWith('/trigger-email') || req.path.startsWith('/api')) {
        return next();
    }
    
    // Tenta servir o frontend buildado
    const frontendPath = path.join(__dirname, 'newsletter-frontend', '.next');
    if (require('fs').existsSync(frontendPath)) {
        // Se for modo dev do Next.js, redireciona para porta 3000
        if (process.env.NODE_ENV !== 'production') {
            return res.redirect('http://localhost:3000');
        }
    }
    
    // Se não tiver frontend, mostra página HTML simples
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tech Newsletter</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 min-h-screen flex items-center justify-center px-4">
    <div class="max-w-md w-full space-y-8">
        <div class="text-center space-y-4">
            <h1 class="text-4xl sm:text-5xl font-bold text-white leading-tight">
                Receba as principais notícias de <span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">tecnologia</span> todos os dias
            </h1>
            <p class="text-gray-300 text-lg">
                Fique por dentro das últimas novidades com nossa newsletter diária
            </p>
        </div>
        
        <form id="subscribeForm" class="space-y-6">
            <div>
                <input
                    type="email"
                    id="email"
                    placeholder="seu@email.com"
                    required
                    class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
            </div>
            
            <button
                type="submit"
                id="submitBtn"
                class="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg shadow-lg hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-transparent transition-all duration-200"
            >
                Inscrever-se
            </button>
        </form>
        
        <div id="feedback" class="hidden rounded-lg p-4"></div>
        
        <div class="text-center text-gray-400 text-sm">
            <p>Grátis • Sem spam • Cancelar quando quiser</p>
        </div>
    </div>

    <script>
        const form = document.getElementById('subscribeForm');
        const emailInput = document.getElementById('email');
        const submitBtn = document.getElementById('submitBtn');
        const feedback = document.getElementById('feedback');

        function showFeedback(message, isError = false) {
            feedback.className = isError 
                ? 'bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-300 text-center'
                : 'bg-green-500/20 border border-green-500/30 rounded-lg p-4 text-green-300 text-center';
            feedback.textContent = message;
            feedback.classList.remove('hidden');
        }

        function isValidEmail(email) {
            return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            
            if (!email) {
                showFeedback('Por favor, insira seu email.', true);
                return;
            }
            
            if (!isValidEmail(email)) {
                showFeedback('Email inválido. Verifique o formato.', true);
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="flex items-center justify-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>Inscrevendo...</span>';
            
            try {
                const res = await fetch('/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                const data = await res.json();
                
                if (!res.ok) {
                    showFeedback(data.error || 'Erro ao cadastrar email.', true);
                } else {
                    showFeedback('Inscrição realizada com sucesso! Verifique seu email 🎉', false);
                    emailInput.value = '';
                }
            } catch {
                showFeedback('Erro de conexão. Tente novamente.', true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Inscrever-se';
            }
        });
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`🚀 Rodando na porta ${PORT}`);
    console.log(`Acesse http://localhost:${PORT} para se inscrever.`);
    console.log(`Acesse http://localhost:${PORT}/api para health check.`);
    console.log(`Acesse http://localhost:${PORT}/trigger-email para forçar o envio da newsletter imediatamente.`);
});
