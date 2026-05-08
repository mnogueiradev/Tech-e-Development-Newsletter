/**
 * Salva uma notícia no banco de dados se não for duplicada
 * @param {Object} pool Conexão com o banco (MySQL pool)
 * @param {Object} newsData Dados formatados da notícia
 */
async function saveNews(pool, newsData) {
    try {
        const {
            title,
            description,
            original_link,
            source_name,
            publication_date,
            category,
            main_image,
            full_content
        } = newsData;

        // Checar se já existe pelo link original
        const [existing] = await pool.execute(
            'SELECT id FROM news WHERE original_link = ?',
            [original_link]
        );

        if (existing.length > 0) {
            console.log(`[DB] 🔁 Notícia duplicada ignorada: ${title}`);
            return false;
        }

        // Se não existir, salvar no banco
        await pool.execute(
            `INSERT INTO news 
            (title, description, original_link, source_name, publication_date, category, main_image, full_content) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title,
                description || '',
                original_link,
                source_name,
                publication_date ? new Date(publication_date) : new Date(),
                category || 'geral',
                main_image || null,
                full_content || null
            ]
        );
        
        console.log(`[DB] ✅ Notícia salva: ${title}`);
        return true;
    } catch (error) {
        console.error(`[DB] ❌ Erro ao salvar notícia (${newsData.title}):`, error.message);
        return false;
    }
}

/**
 * Cria a tabela de notícias caso não exista
 * @param {Object} pool Conexão com o banco (MySQL pool)
 */
async function initNewsTable(pool) {
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS news (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                description TEXT,
                original_link VARCHAR(700) UNIQUE NOT NULL,
                source_name VARCHAR(100),
                publication_date DATETIME,
                category VARCHAR(100),
                main_image VARCHAR(500),
                full_content LONGTEXT,
                collection_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                language VARCHAR(10)
            )
        `);
        console.log('✅ Tabela de notícias verificada/criada com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao criar tabela de notícias:', error.message);
        throw error;
    }
}

module.exports = {
    saveNews,
    initNewsTable
};
