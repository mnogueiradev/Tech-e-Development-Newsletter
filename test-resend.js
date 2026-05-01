const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function test() {
    console.log("Testing resend...");
    const { data, error } = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'nogmath185@gmail.com',
        subject: 'Test',
        html: '<p>Test</p>'
    });
    console.log("Data:", data);
    console.log("Error:", error);
}
test();
