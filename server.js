require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/Banner.png', express.static(path.join(__dirname, 'Banner.png'))); // Server banner to frontend

// ========================
// DATABASE SETUP
// ========================
let pool;
async function initDB() {
    try {
        if (!process.env.TIDB_URL) {
            console.warn('⚠️ AVISO: TIDB_URL não encontrada no .env. Por favor, adicione sua string de conexão do TiDB.');
            return;
        }

        pool = mysql.createPool({
            uri: process.env.TIDB_URL,
            ssl: { rejectUnauthorized: true }, // TiDB exige SSL
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
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
        } catch(e) {}
        
        try {
            await pool.execute(`ALTER TABLE subscribers ADD COLUMN topic VARCHAR(100) DEFAULT 'tecnologia'`);
            console.log('✅ Coluna topic adicionada à tabela de inscritos (ou já existia).');
        } catch(e) {}

        console.log('✅ Banco de dados TiDB conectado e pronto na Nuvem.');

        // Carrega os cron jobs dinâmicos para cada fuso horário já cadastrado
        await loadSchedules();
    } catch (err) {
        console.error('❌ Erro ao conectar no TiDB:', err.message);
    }
}
initDB();

// ========================
// ROUTES
// ========================
app.post('/subscribe', async (req, res) => {
    const { email, timezone, topic } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Email inválido.' });
    }

    const userTZ = timezone || 'America/Sao_Paulo';
    const userTopic = topic || 'tecnologia';

    try {
        await pool.execute(`INSERT INTO subscribers (email, timezone, topic) VALUES (?, ?, ?)`, [email, userTZ, userTopic]);
        res.status(200).json({ message: 'Inscrito com sucesso! Verifique seu email em alguns instantes.' });
        
        // Garante que o cron para esse fuso horário está rodando
        scheduleCronForTimezone(userTZ);

        // Dispara o email imediatamente de forma assíncrona
        sendWelcomeNewsletter(email, userTopic);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Este email já está inscrito!' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Erro interno ao salvar email.' });
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
            return data.results.slice(0, count).map(item => {
                let imgUrl = null;
                
                // 1. Tentar pegar a imagem original direto da API se existir
                if (item.thumbnail && item.thumbnail.original) {
                    imgUrl = item.thumbnail.original;
                } 
                // 2. Se não existir, pegar a URL do proxy do Brave e extrair a original
                else if (item.thumbnail && item.thumbnail.src) {
                    imgUrl = item.thumbnail.src;
                    if (imgUrl.includes('imgs.search.brave.com')) {
                        // O final da URL do Brave Proxy é a URL original em Base64
                        const parts = imgUrl.split('/');
                        const lastPart = parts[parts.length - 1];
                        
                        // aHR0cHM6 = https:// | aHR0cDov = http://
                        if (lastPart && (lastPart.startsWith('aHR0cHM6') || lastPart.startsWith('aHR0cDov'))) {
                            try {
                                imgUrl = Buffer.from(lastPart, 'base64').toString('utf-8');
                            } catch (e) {
                                // Se falhar, mantém a do proxy
                            }
                        }
                    }
                }

                return {
                    title: item.title,
                    link: item.url,
                    description: item.description || '',
                    image: imgUrl,
                    source: (item.meta_url && item.meta_url.hostname) ? item.meta_url.hostname : 'Brave News'
                };
            });
        } catch (err) {
            console.error(`Erro ao buscar notícias do Brave para ${country} (tentativa ${attempt}):`, err.message);
            if (attempt === 3) return [];
            await new Promise(r => setTimeout(r, 2000)); // Espera 2s antes de tentar de novo
        }
    }
    return [];
}

// ========================
// EMAIL SENDING LOGIC
// ========================

// CONFIGURAÇÃO DO EMAIL
// ATENÇÃO: O usuário deve fornecer o EMAIL e SENHA DE APP no arquivo .env
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER || 'nogmath185@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD || 'SUA_SENHA_DE_APP_GMAIL_AQUI'
    }
});

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
        <div style="margin-bottom: 30px; padding: 20px 0; border-bottom: 1px solid #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    ${item.image ? `
                    <td width="140" valign="top" style="padding-right: 15px; padding-top: 5px;">
                        <img src="${item.image}" alt="Imagem da notícia" style="width: 140px; height: 100px; object-fit: cover; border-radius: 8px; display: block;">
                    </td>
                    ` : ''}
                    <td valign="top">
                        <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #000000; line-height: 1.3;">${escapeHtml(item.title)}</h3>
                        ${item.description ? '<p style="margin: 0; font-size: 14px; color: #333333; line-height: 1.5;">' + escapeHtml(item.description) + '</p>' : ''}
                    </td>
                </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 15px;">
                <tr>
                    <td align="left" style="font-size: 13px; color: #666666;">
                        Fonte: <strong>${escapeHtml(item.source)}</strong>
                    </td>
                    <td align="right">
                        <a href="${item.link}" style="color: #000000; text-decoration: none; font-size: 13px; font-weight: bold; padding: 6px 12px; background: #f1f5f9; border-radius: 6px; display: inline-block;">Ler ➔</a>
                    </td>
                </tr>
            </table>
        </div>
    `;

    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #000000; overflow: hidden;">
        <!-- Banner Header -->
        <div style="text-align: center; padding: 20px 0;">
            <img src="cid:banner" alt="Newsletter Banner" style="max-width: 100%; height: auto; border-radius: 8px;">
        </div>
        
        <div style="padding: 20px 0;">
            <h2 style="color: #000000; text-align: center; margin-top: 0; font-size: 24px;">${topic === 'financas' ? 'Sua Dose Diária de Finanças' : 'Sua Dose Diária de Tecnologia'}</h2>
            <p style="text-align: center; color: #666666; margin-bottom: 40px; font-size: 15px;">Aqui estão as 9 notícias mais quentes de hoje, diretamente das melhores fontes brasileiras.</p>

            <h2 style="border-bottom: 2px solid #000000; padding-bottom: 10px; color: #000000; font-size: 22px;">Principais Notícias</h2>
            ${newsBR.map(renderNewsItem).join('')}
        </div>
        
        <div style="background-color: #f8fafc; padding: 30px 20px; text-align: center; font-size: 12px; color: #666666; border-top: 1px solid #e2e8f0; border-radius: 8px; margin-top: 20px;">
            <p>Enviado com ❤️ por nogmath185@gmail.com</p>
            <p>© ${new Date().getFullYear()} Tech &amp; Development Newsletter. Todos os direitos reservados.</p>
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
                tecnologia: { br: 'tecnologia', us: 'technology', ru: 'технологии' },
                financas: { br: 'finanças mercado', us: 'finance market', ru: 'финансы экономика' }
            };
            const q = queries[topic] || queries['tecnologia'];

            const newsBR = await fetchFromBraveSearch(q.br, 'br', 9);

            // 2. Montar HTML com o tópico correto
            const htmlContent = buildEmailHtml(newsBR, topic);

            // 4. Enviar email usando nodemailer
            const mailOptions = {
                from: 'nogmath185@gmail.com',
                bcc: bccEmails,
                subject: `🌎 Tech & Development Newsletter: As 9 principais notícias do dia (${new Date().toLocaleDateString('pt-BR')})`,
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
    console.log(`Enviando newsletter de boas-vindas para: ${email} (Tópico: ${topic})...`);
    try {
        const queries = {
            tecnologia: { br: 'tecnologia', us: 'technology', ru: 'технологии' },
            financas: { br: 'finanças mercado', us: 'finance market', ru: 'финансы экономика' }
        };
        const q = queries[topic] || queries['tecnologia'];

        const newsBR = await fetchFromBraveSearch(q.br, 'br', 9);

        const htmlContent = buildEmailHtml(newsBR, topic);

        const mailOptions = {
            from: 'nogmath185@gmail.com',
            to: email, // Enviando direto para quem acabou de se inscrever
            subject: `🎉 Bem-vindo(a) à Tech & Development Newsletter!`,
            html: htmlContent,
            attachments: [{
                filename: 'Banner.png',
                path: path.join(__dirname, 'Banner.png'),
                cid: 'banner'
            }]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Newsletter de boas-vindas enviada com sucesso! ID:', info.messageId);
    } catch (error) {
        console.error('Erro ao enviar newsletter de boas-vindas:', error);
    }
}

// ========================
// CRON JOB DINÂMICO
// ========================
const scheduledTimezones = new Set();

function scheduleCronForTimezone(tz) {
    if (scheduledTimezones.has(tz)) return;
    
    console.log(`⏰ Agendando disparo diário (08:00) para o fuso horário: ${tz}`);
    
    cron.schedule('0 8 * * *', () => {
        console.log(`⏰ [CRON] Disparando newsletter das 08:00 para o fuso: ${tz}`);
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
// START SERVER
// ========================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta http://localhost:${PORT}`);
    console.log(`Acesse http://localhost:${PORT} para se inscrever.`);
    console.log(`Acesse http://localhost:${PORT}/trigger-email para forçar o envio da newsletter imediatamente.`);
});
