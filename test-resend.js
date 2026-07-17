require('dotenv').config();
const { sendEmail } = require('./services/emailSender');

async function test() {
    console.log("Testing Resend API...");
    const result = await sendEmail({
        to: 'nogmath185@gmail.com',
        subject: 'Test',
        html: '<p>Test from Resend</p>'
    });
    console.log("Result:", result);
}
test();
