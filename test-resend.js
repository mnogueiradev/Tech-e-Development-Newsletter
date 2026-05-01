const { Resend } = require('resend');
const resend = new Resend('re_iYaTQtyf_AXzrdzHARZbuh24KtZbpY54S');

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
