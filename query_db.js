require('dotenv').config();
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL
});

async function run() {
    const [rows] = await pool.query('SELECT DISTINCT category FROM news_v2');
    console.log('Categories from news_v2:');
    console.log(rows);
    
    const [rows2] = await pool.query('SELECT DISTINCT category FROM news_sources');
    console.log('Categories from news_sources:');
    console.log(rows2);
    
    pool.end();
}
run();
