class CMSService {
    constructor(pool) {
        this.pool = pool;
    }

    async getNewsList({ page = 1, limit = 20, search = '', status = '', category = '', source_id = '', sortBy = 'created_at', sortOrder = 'desc' }) {
        const offset = (page - 1) * limit;
        const params = [];
        let whereClauses = [];

        if (search) {
            whereClauses.push('(n.title LIKE ? OR n.description LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        if (status) {
            whereClauses.push('n.status = ?');
            params.push(status);
        }

        if (category) {
            whereClauses.push('n.category = ?');
            params.push(category);
        }

        if (source_id) {
            whereClauses.push('n.source_id = ?');
            params.push(source_id);
        }

        const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        // Safe sort mapping
        const validSortFields = {
            'score': 'n.score',
            'created_at': 'n.collection_date', // in news_v2 this is collection_date
            'title': 'n.title'
        };
        const sortField = validSortFields[sortBy] || 'n.collection_date';
        const sortDir = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const parsedLimit = parseInt(limit, 10) || 20;
        const parsedOffset = parseInt(offset, 10) || 0;

        const query = `
            SELECT 
                n.id, n.title, n.slug, n.description, n.original_link, 
                n.category, n.tags, n.main_image, n.status, n.score, 
                n.collection_date as created_at, n.metadata,
                s.name as source_name
            FROM news_v2 n
            LEFT JOIN news_sources s ON n.source_id = s.id
            ${whereSQL}
            ORDER BY ${sortField} ${sortDir}
            LIMIT ${parsedLimit} OFFSET ${parsedOffset}
        `;
        
        const countQuery = `
            SELECT COUNT(*) as total
            FROM news_v2 n
            ${whereSQL}
        `;

        try {
            // Conta total para paginação
            const [countRows] = await this.pool.execute(countQuery, params);
            const total = countRows[0].total;

            // Busca os dados
            const [rows] = await this.pool.execute(query, params);

            return {
                data: rows,
                pagination: {
                    total,
                    page: parseInt(page, 10) || 1,
                    limit: parsedLimit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (err) {
            console.error("Erro ao buscar lista de notícias no CMS:", err);
            throw err;
        }
    }

    async getNewsDetails(id) {
        try {
            const [rows] = await this.pool.execute(`
                SELECT 
                    n.*, n.collection_date as created_at,
                    s.name as source_name
                FROM news_v2 n
                LEFT JOIN news_sources s ON n.source_id = s.id
                WHERE n.id = ?
            `, [id]);

            if (rows.length === 0) return null;
            return rows[0];
        } catch (err) {
            console.error("Erro ao buscar detalhes da notícia:", err);
            throw err;
        }
    }

    async updateNewsStatus(id, status) {
        const validStatuses = ['pendente', 'coletada', 'aprovada', 'rejeitada', 'destacada', 'arquivada'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Status inválido: ${status}`);
        }

        try {
            await this.pool.execute('UPDATE news_v2 SET status = ? WHERE id = ?', [status, id]);
            return true;
        } catch (err) {
            console.error("Erro ao atualizar status da notícia:", err);
            throw err;
        }
    }

    async updateEditorialNotes(id, { editorial_summary, internal_note }) {
        try {
            // Primeiro, busca a notícia atual para mesclar o metadata
            const [rows] = await this.pool.execute('SELECT metadata FROM news_v2 WHERE id = ?', [id]);
            if (rows.length === 0) throw new Error("Notícia não encontrada.");

            let metadata = rows[0].metadata || {};
            if (typeof metadata === 'string') {
                metadata = JSON.parse(metadata);
            }

            // Atualiza os campos editoriais
            if (editorial_summary !== undefined) metadata.editorial_summary = editorial_summary;
            if (internal_note !== undefined) metadata.internal_note = internal_note;

            await this.pool.execute(
                'UPDATE news_v2 SET metadata = ? WHERE id = ?',
                [JSON.stringify(metadata), id]
            );

            return true;
        } catch (err) {
            console.error("Erro ao atualizar notas editoriais:", err);
            throw err;
        }
    }

    async getFilterOptions() {
        try {
            const [sources] = await this.pool.execute('SELECT id, name FROM news_sources ORDER BY name ASC');
            const [categories] = await this.pool.execute('SELECT DISTINCT category FROM news_v2 WHERE category IS NOT NULL');
            
            return {
                sources,
                categories: categories.map(c => c.category)
            };
        } catch (err) {
            console.error("Erro ao buscar opções de filtro:", err);
            throw err;
        }
    }
}

module.exports = CMSService;
