import { Clock, ExternalLink, Calendar, Bookmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategorySlug, getCategoryName } from '../utils/categoryMap';
import { trackEvent } from '../utils/analytics';

export default function NewsCard({ item }) {
  const slug = getCategorySlug(item.category);
  const categoryTitle = getCategoryName(slug || item.category);
  const linkUrl = item.original_link || item.url || '#';
  const mainImage = item.main_image || item.image;

  const handleClick = () => {
    trackEvent('news_click', {
      newsId: item.id,
      title: item.title,
      category: slug,
      source: item.source_name
    });
  };

  const formattedDate = item.published_at 
    ? new Date(item.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <article className="group bg-[#121212] border border-white/5 rounded-2xl p-5 md:p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 flex flex-col md:flex-row gap-6 relative overflow-hidden">
      
      {/* Imagem em destaque com lazy loading */}
      {mainImage && (
        <div className="w-full md:w-56 h-48 md:h-auto shrink-0 rounded-xl overflow-hidden bg-white/5 relative">
          <img 
            src={mainImage} 
            alt={item.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              e.currentTarget.parentElement.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>
        </div>
      )}

      <div className="flex flex-col flex-grow justify-between">
        <div>
          {/* Header do Card: Categoria, Tempo de Leitura e Edição */}
          <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
            {slug ? (
              <Link 
                to={`/categoria/${slug}`} 
                onClick={() => trackEvent('category_click', { category: slug })}
                className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1 rounded-full font-bold uppercase tracking-wider transition-colors"
              >
                {categoryTitle}
              </Link>
            ) : (
              <span className="bg-white/5 text-gray-300 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                {item.category || 'Tecnologia'}
              </span>
            )}

            {item.readingTime && (
              <span className="text-gray-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                {item.readingTime}
              </span>
            )}

            {item.edition_slug && (
              <Link 
                to={`/edicoes/${item.edition_slug}`}
                className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium underline-offset-2 hover:underline"
              >
                <Bookmark className="w-3.5 h-3.5" />
                Ver na Edição
              </Link>
            )}
          </div>

          {/* Título com Link Externo */}
          <a 
            href={linkUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={handleClick}
            className="group/title block mb-2"
          >
            <h3 className="text-xl md:text-2xl font-bold text-white leading-snug group-hover/title:text-primary transition-colors flex items-start justify-between gap-2">
              <span>{item.title}</span>
              <ExternalLink className="w-5 h-5 text-gray-500 group-hover/title:text-primary shrink-0 mt-1 opacity-0 group-hover/title:opacity-100 transition-all" />
            </h3>
          </a>

          {/* Resumo */}
          <p className="text-sm md:text-base text-gray-400 line-clamp-3 leading-relaxed mb-4">
            {item.description || item.summary}
          </p>
        </div>

        {/* Rodapé do Card: Fonte, Score e Data */}
        <div className="pt-4 border-t border-white/5 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2 mt-auto">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-300 bg-white/5 px-2.5 py-1 rounded">
              {item.source_name || 'Fonte Oficial'}
            </span>
            
            {item.score && (
              <span className="text-primary/90 font-medium">
                Score: <strong className="text-white">{item.score}</strong>
              </span>
            )}
          </div>

          {formattedDate && (
            <span className="flex items-center gap-1 text-gray-400">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              {formattedDate}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
