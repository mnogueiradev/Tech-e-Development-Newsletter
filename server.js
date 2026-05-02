require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const { Resend } = require('resend');


const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

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

        console.log(" Salvo no DB");

        const emailSent = await sendWelcomeNewsletter(email, userTopic);

        if (!emailSent) {
            return res.status(500).json({
                error: "Falha ao enviar email"
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

            const { data, error } = await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: bccEmails, // Em modo de teste (onboarding), você não pode usar bcc para vários emails.
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
// Backend funcionando apenas como API. 
// O frontend em Next.js (hospedado no Render) é a única interface válida.
app.use((req, res) => {
    res.status(404).json({ error: 'A API está online. Acesse a interface do frontend via o link do Render ou pela porta do Next.js localmente.' });
});

app.listen(PORT, () => {
    console.log(`🚀 Rodando na porta ${PORT}`);
    console.log(`Acesse http://localhost:${PORT} para se inscrever.`);
    console.log(`Acesse http://localhost:${PORT}/api para health check.`);
    console.log(`Acesse http://localhost:${PORT}/trigger-email para forçar o envio da newsletter imediatamente.`);
});
