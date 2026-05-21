require('dotenv').config();
const mysql = require('mysql2/promise');

async function verInscritos() {
    console.log('Buscando lista de inscritos no TiDB...\n');

    if (!process.env.TIDB_URL) {
        console.error('❌ ERRO: TIDB_URL não encontrada no .env');
        return;
    }

    try {
        const pool = mysql.createPool({
            uri: process.env.TIDB_URL,
            ssl: { rejectUnauthorized: true }
        });

        const [rows] = await pool.query('SELECT id, email, timezone, subscribed_at as data_inscricao FROM subscribers');

        if (rows.length === 0) {
            console.log('Nenhum inscrito encontrado no banco de dados.');
        } else {
            console.table(rows);
            console.log(`\nTotal de inscritos: ${rows.length}`);
        }

        await pool.end();
    } catch (err) {
        console.error('Erro ao conectar ou buscar do TiDB:', err.message);
    }
}

verInscritos();
