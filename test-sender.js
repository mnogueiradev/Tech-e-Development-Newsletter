require('dotenv').config();
const { sendEmail } = require('./services/emailSender');

async function test() {
    console.log("Testing Sender.net...");
    const result = await sendEmail({
        to: 'nogmath185@gmail.com',
        subject: 'Test',
        html: '<p>Test from Sender.net</p>'
    });
    console.log("Result:", result);
}
test();
