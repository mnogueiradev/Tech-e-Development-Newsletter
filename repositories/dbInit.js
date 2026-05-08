const crypto = require('crypto');

async function initializeDatabase(pool) {
    try {
        console.log('[DB INIT] Verificando/Criando estrutura do banco de dados...');

        // 1. Tabela de Fontes de Notícias (Normalização)
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS news_sources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                rss_url VARCHAR(500) UNIQUE NOT NULL,
                category VARCHAR(50) DEFAULT 'tecnologia',
                language VARCHAR(10) DEFAULT 'pt-BR',
                is_active BOOLEAN DEFAULT TRUE,
                collection_frequency_minutes INT DEFAULT 30,
                last_collected_at DATETIME NULL,
                priority INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Tabela de Notícias (Nova Estrutura)
        // Usamos status como VARCHAR para compatibilidade melhor, mas pode ser ENUM.
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS news_v2 (
                id INT AUTO_INCREMENT PRIMARY KEY,
                source_id INT,
                title VARCHAR(500) NOT NULL,
                slug VARCHAR(500),
                description TEXT,
                full_content LONGTEXT,
                original_link VARCHAR(700) UNIQUE NOT NULL,
                category VARCHAR(100),
                tags JSON,
                main_image VARCHAR(500),
                author VARCHAR(200),
                language VARCHAR(10) DEFAULT 'pt-BR',
                publication_date DATETIME,
                collection_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'coletada', 
                score DECIMAL(10,2) DEFAULT 0,
                content_hash VARCHAR(255) UNIQUE,
                metadata JSON,
                FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE SET NULL
            )
        `);

        // Garantir que a coluna score existe caso a tabela já tenha sido criada antes
        try {
            await pool.execute('ALTER TABLE news_v2 ADD COLUMN score DECIMAL(10,2) DEFAULT 0');
        } catch (e) { /* Ignora se já existir */ }

        // Índices para performance (ignoramos o erro se já existirem)
        try {
            await pool.execute('CREATE INDEX idx_news_status ON news_v2(status)');
            await pool.execute('CREATE INDEX idx_news_pub_date ON news_v2(publication_date)');
            await pool.execute('CREATE INDEX idx_news_source ON news_v2(source_id)');
            await pool.execute('CREATE INDEX idx_news_score ON news_v2(score)');
        } catch (e) { /* Índices provavelmente já existem */ }

        // 3. Tabela de Logs de Coleta
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS collection_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                source_id INT,
                start_time DATETIME NOT NULL,
                end_time DATETIME NOT NULL,
                duration_ms INT NOT NULL,
                news_found INT DEFAULT 0,
                news_saved INT DEFAULT 0,
                duplicates INT DEFAULT 0,
                errors TEXT,
                status VARCHAR(50) DEFAULT 'success',
                FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE CASCADE
            )
        `);

        // 4. Migração das fontes Hardcoded para o Banco (Se a tabela estiver vazia)
        const [sources] = await pool.execute('SELECT COUNT(*) as count FROM news_sources');
        if (sources[0].count === 0) {
            console.log('[DB INIT] Populando fontes de notícias padrão...');
            const defaultSources = [
                { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tecnologia', lang: 'en' },
                { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tecnologia', lang: 'en' },
                { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'tecnologia', lang: 'en' },
                { name: 'Olhar Digital', url: 'https://olhardigital.com.br/rss', category: 'tecnologia', lang: 'pt-BR' },
                { name: 'Canaltech', url: 'https://canaltech.com.br/rss', category: 'tecnologia', lang: 'pt-BR' },
                { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tecnologia', lang: 'en' }
            ];

            for (const src of defaultSources) {
                await pool.execute(
                    'INSERT INTO news_sources (name, rss_url, category, language) VALUES (?, ?, ?, ?)',
                    [src.name, src.url, src.category, src.lang]
                );
            }
        }

        console.log('[DB INIT] ✅ Estrutura de banco (V2) inicializada com sucesso.');
    } catch (error) {
        console.error('[DB INIT] ❌ Erro ao inicializar banco de dados:', error);
        throw error;
    }
}

module.exports = { initializeDatabase };
