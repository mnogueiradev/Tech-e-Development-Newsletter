require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');

const token = process.env.ADMIN_TOKEN;
if (!token) {
    console.error('ADMIN_TOKEN não definido no .env');
    process.exit(1);
}

http.get({
    hostname: 'localhost',
    port: process.env.PORT || 3000,
    path: '/trigger-email',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
}, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log(`HTTP ${res.statusCode}`);
        console.log(data);
    });
}).on('error', (err) => {
    console.error('Erro:', err.message);
    process.exit(1);
});
