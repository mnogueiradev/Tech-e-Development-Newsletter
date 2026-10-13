const cheerio = require('cheerio');

class ImageExtractor {
    static normalizeHttpsUrl(value, baseUrl = null) {
        if (!value || typeof value !== 'string') return null;

        try {
            const url = baseUrl ? new URL(value.trim(), baseUrl) : new URL(value.trim());
            if (url.protocol === 'http:') url.protocol = 'https:';
            if (url.protocol !== 'https:') return null;
            return url.href;
        } catch (error) {
            return null;
        }
    }

    /**
     * Confirma que a URL HTTPS responde com um formato seguro e comum em email.
     * Alguns servidores rejeitam HEAD, então tentamos um GET com Range em seguida.
     */
    static async isValidImageUrl(url) {
        const imageUrl = this.normalizeHttpsUrl(url);
        if (!imageUrl) return false;

        const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/gif']);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const checkResponse = async (method) => {
            const response = await fetch(imageUrl, {
                method,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/jpeg,image/png,image/gif,*/*;q=0.8',
                    ...(method === 'GET' ? { Range: 'bytes=0-0' } : {})
                },
                signal: controller.signal
            });

            let finalProtocol = null;
            try {
                finalProtocol = new URL(response.url || imageUrl).protocol;
            } catch (error) {
                finalProtocol = null;
            }
            const contentType = String(response.headers.get('content-type') || '')
                .split(';')[0]
                .trim()
                .toLowerCase();
            const valid = response.ok && finalProtocol === 'https:' && supportedTypes.has(contentType);

            if (response.body) {
                await response.body.cancel().catch(() => {});
            }

            return valid;
        };

        try {
            if (await checkResponse('HEAD')) return true;
            return await checkResponse('GET');
        } catch (err) {
            console.error(`[IMAGE_EXTRACTOR] ⚠️ Imagem indisponível ou incompatível: ${imageUrl}`);
            return false;
        } finally {
            clearTimeout(timeoutId);
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

            // Resolve URLs relativas e protocol-relative sem concatenar caminhos incorretamente.
            return this.normalizeHttpsUrl(imageUrl, articleUrl);
        } catch (err) {
            console.error(`[IMAGE_EXTRACTOR] ⚠️ Erro ao extrair og:image de ${articleUrl}:`, err.message);
            return null;
        }
    }

    /**
     * Tenta obter a melhor imagem possível seguindo a ordem de fallback:
     * 1. Valida a thumbnail original (da API/RSS)
     * 2. Extrai og:image da página da notícia
     * 3. Omite a imagem quando não há uma alternativa válida.
     */
    static async getBestThumbnail(originalThumbnail, articleUrl) {
        console.log(`[IMAGE_EXTRACTOR] 🔍 Analisando imagem para: ${articleUrl}`);

        // 1. Tenta a thumbnail original
        const normalizedThumbnail = this.normalizeHttpsUrl(originalThumbnail, articleUrl);
        if (normalizedThumbnail) {
            const isValid = await this.isValidImageUrl(normalizedThumbnail);
            if (isValid) {
                console.log(`[IMAGE_EXTRACTOR] ✅ Usando thumbnail original (Brave/RSS)`);
                return normalizedThumbnail;
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

        // 3. Não persiste placeholder relativo: ele não pode ser resolvido por clientes de email.
        console.log(`[IMAGE_EXTRACTOR] ⚠️ Nenhuma imagem válida. O card será exibido sem imagem.`);
        return null;
    }
}

module.exports = ImageExtractor;
