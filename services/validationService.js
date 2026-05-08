const crypto = require('crypto');

class ValidationService {
    /**
     * Gera um fingerprint para o conteúdo para previnir duplicações além do link
     * @param {string} content Conteúdo textual
     * @returns {string|null} Hash em SHA-256 ou null se vazio
     */
    static generateHash(content) {
        if (!content) return null;
        return crypto.createHash('sha256').update(content.trim()).digest('hex');
    }

    /**
     * Limpa e valida os dados de uma notícia antes de salvar
     * @param {Object} rawData 
     * @returns {Object}
     */
    static sanitizeNews(rawData) {
        // Remover tags HTML básicas do título se houver
        let cleanTitle = rawData.title ? rawData.title.replace(/<\/?[^>]+(>|$)/g, "").trim() : '';
        
        // Criar um slug rudimentar caso precise futuramente
        const slug = cleanTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');

        // Truncar descrições ou conteúdos muito grandes (apenas segurança do banco)
        const cleanDescription = rawData.description ? rawData.description.trim() : null;
        
        // Se a data for inválida, joga a data de hoje
        let pubDate = rawData.publication_date;
        if (pubDate && isNaN(new Date(pubDate).getTime())) {
            pubDate = new Date();
        } else if (!pubDate) {
            pubDate = new Date();
        }

        // Criar o fingerprint misturando título e link
        const hashContent = `${cleanTitle}|${rawData.original_link}`;
        const content_hash = this.generateHash(hashContent);

        return {
            source_id: rawData.source_id,
            title: cleanTitle,
            slug: slug.substring(0, 500),
            description: cleanDescription,
            full_content: rawData.full_content ? rawData.full_content.trim() : null,
            original_link: rawData.original_link ? rawData.original_link.trim().substring(0, 700) : null,
            category: rawData.category || 'geral',
            tags: [], // array futuro
            main_image: rawData.main_image ? rawData.main_image.substring(0, 500) : null,
            author: rawData.author ? rawData.author.substring(0, 200) : null,
            language: rawData.language || 'pt-BR',
            publication_date: pubDate,
            status: 'coletada', // Estado inicial da pipeline de curadoria
            content_hash: content_hash,
            metadata: {
                extracted_at: new Date().toISOString()
            }
        };
    }
}

module.exports = ValidationService;
