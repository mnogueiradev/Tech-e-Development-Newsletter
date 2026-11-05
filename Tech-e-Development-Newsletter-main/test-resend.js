require('dotenv').config();
const { sendDiagnosticEmail } = require('../services/emailSender');

async function test() {
    if (require.main !== module) throw new Error('Execute este diagnóstico manual diretamente.');
    console.log('Testing Resend API diagnostic...');
    const result = await sendDiagnosticEmail();
    console.log('Result:', result);
}

if (require.main === module) {
    test().catch(error => {
        console.error('[RESEND DIAGNOSTIC]', error.message);
        process.exitCode = 1;
    });
}
