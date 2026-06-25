const SENDER_API_URL = 'https://api.sender.net/v2/message/send';

/**
 * Envia um e-mail utilizando a API da Sender.net
 * @param {Object} params
 * @param {string} params.to E-mail do destinatário
 * @param {string} params.subject Assunto do e-mail
 * @param {string} params.html Corpo do e-mail em formato HTML
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html }) {
    const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@techndevn.com';
    const FROM_NAME = 'Tech & Dev Newsletter';
    const SENDER_API_KEY = process.env.SENDER_API_KEY;

    if (!SENDER_API_KEY) {
        console.error("❌ Erro: SENDER_API_KEY não configurada.");
        return { success: false, error: "Missing API Key" };
    }

    const payload = {
        from: {
            email: FROM_EMAIL,
            name: FROM_NAME
        },
        to: [
            { email: to }
        ],
        subject: subject,
        html: html
    };

    try {
        const response = await fetch(SENDER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENDER_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(`❌ Erro da API do Sender (${response.status}):`, data);
            return { success: false, error: data.message || `HTTP ${response.status}` };
        }

        console.log(`✅ Email enviado via Sender para: ${to}`);
        return { success: true, id: data.message_id || 'dispatched' };
    } catch (error) {
        console.error("❌ Falha de rede/timeout ao enviar via Sender:", error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { sendEmail };
