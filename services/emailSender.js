const RESEND_API_URL = 'https://api.resend.com/emails';

// Respeita o rate limit do Resend (10 req/s): até 3 tentativas em caso de 429
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_SECONDS = [2, 5, 10];

/**
 * Envia um e-mail utilizando a API do Resend
 * @param {Object} params
 * @param {string} params.to E-mail do destinatário
 * @param {string} params.subject Assunto do e-mail
 * @param {string} params.html Corpo do e-mail em formato HTML
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html }) {
    const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@techndevn.com';
    const FROM_NAME = 'Tech & Dev Newsletter';
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
        console.error("❌ Erro: RESEND_API_KEY não configurada.");
        return { success: false, error: "Missing API Key" };
    }
    console.log('📧 to recebido:', to, 'Tipo:', typeof to);

    const payload = {
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject: subject,
        html: html
    };

    try {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const response = await fetch(RESEND_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 429) {
                if (attempt >= MAX_ATTEMPTS) {
                    // 3ª falha: devolve {success:false} como antes
                    console.log(`[RESEND] 429 para ${to} — tentativa ${attempt} (última), desistindo.`);
                    console.error(`❌ Erro da API do Resend (${response.status}):`, data);
                    return { success: false, error: data.message || `HTTP ${response.status}` };
                }

                // 1ª falha 429: respeita o header Retry-After (em segundos) se existir; senão, backoff fixo
                let waitSeconds = RETRY_DELAYS_SECONDS[attempt - 1];
                if (attempt === 1) {
                    const retryAfter = parseInt(response.headers.get('retry-after'), 10);
                    if (Number.isFinite(retryAfter) && retryAfter >= 0) {
                        waitSeconds = retryAfter;
                    }
                }

                console.log(`[RESEND] 429 para ${to} — tentativa ${attempt}, aguardando ${waitSeconds}s.`);
                await new Promise(r => setTimeout(r, waitSeconds * 1000));
                continue;
            }

            if (!response.ok) {
                console.error(`❌ Erro da API do Resend (${response.status}):`, data);
                return { success: false, error: data.message || `HTTP ${response.status}` };
            }

            console.log(`✅ Email enviado via Resend para: ${to}`);
            return { success: true, id: data.id || 'dispatched' };
        }

        // Inalcançável: o laço sempre retorna na última tentativa
        return { success: false, error: 'HTTP 429' };
    } catch (error) {
        console.error("❌ Falha de rede/timeout ao enviar via Resend:", error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { sendEmail };
