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

        // 4. Tabela de Seleções da Newsletter (Edições)
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS edition_selections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                news_id INT,
                edition_date DATE,
                position INT,
                reason TEXT,
                algorithm_version VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (news_id) REFERENCES news_v2(id) ON DELETE CASCADE
            )
        `);

        // 4.1 Tabela de Edições (Metadados públicos para SEO e Arquivo)
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS editions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                edition_date DATE UNIQUE NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4.2 Popula tabela de edições com dados legados se necessário
        await pool.execute(`
            INSERT IGNORE INTO editions (edition_date, slug, title, description)
            SELECT DISTINCT edition_date, 
                   DATE_FORMAT(edition_date, '%Y-%m-%d') as slug,
                   CONCAT('Techndevn Newsletter — Edição de ', DATE_FORMAT(edition_date, '%d/%m/%Y')) as title,
                   'As principais notícias de tecnologia e desenvolvimento curadas pela nossa IA.' as description
            FROM edition_selections
        `);

        // 4.3 Tabela de Feedback por Notícia (Upvote / Downvote)
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS news_feedback (
              id INT AUTO_INCREMENT PRIMARY KEY,
              news_id INT NOT NULL,
              subscriber_id INT NOT NULL,
              vote ENUM('up', 'down') NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY unique_vote (news_id, subscriber_id),
              FOREIGN KEY (news_id) REFERENCES news_v2(id) ON DELETE CASCADE,
              FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
            )
        `);

        // 5. Migração/Inclusão das Fontes de Notícias no Banco
        console.log('[DB INIT] Garantindo presença das fontes de notícias padrão...');
        const defaultSources = [
            { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'desenvolvimento', lang: 'en' },
            { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'ia', lang: 'en' },
            { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'desenvolvimento', lang: 'en' },
            { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'desenvolvimento', lang: 'en' },
            { name: 'Olhar Digital', url: 'https://olhardigital.com.br/rss', category: 'desenvolvimento', lang: 'pt-BR' },
            { name: 'Canaltech', url: 'https://canaltech.com.br/rss', category: 'desenvolvimento', lang: 'pt-BR' },
            { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'desenvolvimento', lang: 'en' },
            { name: 'Hacker News AI', url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT+OR+OpenAI', category: 'ia', lang: 'en' },
            { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'ciberseguranca', lang: 'en' },
            { name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/', category: 'cloud', lang: 'en' },
            // Novas fontes brasileiras (Adicionadas em 26/09/2026)
            { name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/', category: 'desenvolvimento', lang: 'pt-BR' },
            { name: 'TechTudo', url: 'https://www.techtudo.com.br/rss/techtudo/', category: 'desenvolvimento', lang: 'pt-BR' },
            { name: 'TecMundo', url: 'https://rss.tecmundo.com.br/feed', category: 'desenvolvimento', lang: 'pt-BR' },
            { name: 'Hardware.com.br', url: 'https://www.hardware.com.br/feed/', category: 'hardware', lang: 'pt-BR' },
            { name: 'Startupi', url: 'https://startupi.com.br/feed/', category: 'startups', lang: 'pt-BR' }
        ];

        for (const src of defaultSources) {
            await pool.execute(
                'INSERT IGNORE INTO news_sources (name, rss_url, category, language) VALUES (?, ?, ?, ?)',
                [src.name, src.url, src.category, src.lang]
            );
        }

        console.log('[DB INIT] ✅ Estrutura de banco (V2) inicializada com sucesso.');
    } catch (error) {
        console.error('[DB INIT] ❌ Erro ao inicializar banco de dados:', error);
        throw error;
    }
}

module.exports = { initializeDatabase };
