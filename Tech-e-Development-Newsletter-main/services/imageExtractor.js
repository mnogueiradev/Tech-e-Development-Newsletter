const cheerio = require('cheerio');

class ImageExtractor {
    /**
     * Valida se uma URL de imagem é acessível e não está quebrada
     */
    static async isValidImageUrl(url) {
        if (!url || !url.startsWith('http')) return false;
        
        try {
            // Usa fetch com timeout curto para não travar o processo
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Aceita 200 OK ou qualquer redirecionamento válido
            return response.ok || (response.status >= 300 && response.status < 400);
        } catch (err) {
            console.error(`[IMAGE_EXTRACTOR] ⚠️ Imagem falhou na validação: ${url}`);
            return false;
        }
    }

    /**
     * Raspa a página original da notícia em busca da imagem oficial (Open Graph)
     */
    static async extractOgImage(articleUrl) {
        if (!articleUrl || !articleUrl.startsWith('http')) return null;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seg timeout

            const response = await fetch(articleUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) return null;

            const html = await response.text();
            const $ = cheerio.load(html);

            // Tenta pegar o og:image primeiro
            let imageUrl = $('meta[property="og:image"]').attr('content');

            // Se não achar, tenta twitter:image
            if (!imageUrl) {
                imageUrl = $('meta[name="twitter:image"]').attr('content');
            }

            // Garante que é uma URL absoluta
            if (imageUrl && !imageUrl.startsWith('http')) {
                const urlObj = new URL(articleUrl);
                imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
            }

            return imageUrl;
        } catch (err) {
            console.error(`[IMAGE_EXTRACTOR] ⚠️ Erro ao extrair og:image de ${articleUrl}:`, err.message);
            return null;
        }
    }

    /**
     * Tenta obter a melhor imagem possível seguindo a ordem de fallback:
     * 1. Valida a thumbnail original (da API/RSS)
     * 2. Extrai og:image da página da notícia
     * 3. Retorna o Placeholder
     */
    static async getBestThumbnail(originalThumbnail, articleUrl) {
        const PLACEHOLDER_URL = '/Banner.png';

        console.log(`[IMAGE_EXTRACTOR] 🔍 Analisando imagem para: ${articleUrl}`);

        // 1. Tenta a thumbnail original
        if (originalThumbnail) {
            const isValid = await this.isValidImageUrl(originalThumbnail);
            if (isValid) {
                console.log(`[IMAGE_EXTRACTOR] ✅ Usando thumbnail original (Brave/RSS)`);
                return originalThumbnail;
            }
        }

        // 2. Fallback: Extrai og:image
        console.log(`[IMAGE_EXTRACTOR] 🔄 Thumbnail original quebrada/vazia. Tentando extrair og:image...`);
        const ogImage = await this.extractOgImage(articleUrl);
        
        if (ogImage) {
            const isOgValid = await this.isValidImageUrl(ogImage);
            if (isOgValid) {
                console.log(`[IMAGE_EXTRACTOR] ✅ Usando imagem extraída da página (og:image)`);
                return ogImage;
            }
        }

        // 3. Placeholder final
        console.log(`[IMAGE_EXTRACTOR] ⚠️ Nenhuma imagem válida. Usando placeholder padrão.`);
        return PLACEHOLDER_URL;
    }
}

module.exports = ImageExtractor;
