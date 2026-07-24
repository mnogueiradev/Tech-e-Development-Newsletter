import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Clock, ExternalLink, ChevronRight, Bookmark } from 'lucide-react';
import api from '../services/api';
import Footer from '../components/Footer';
import { getCategorySlug, getCategoryName } from '../utils/categoryMap';
import { trackEvent } from '../utils/analytics';

export default function EditionDetail() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEdition = async () => {
      try {
        const response = await api.get(`/api/public/editions/${slug}`);
        setData(response.data);
      } catch (err) {
        console.error('Error fetching edition detail:', err);
        setError('Edição não encontrada.');
      } finally {
        setLoading(false);
      }
    };
    fetchEdition();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white p-4">
        <h1 className="text-3xl font-extrabold text-white mb-4">404</h1>
        <p className="text-gray-400 mb-8">{error || 'Edição não encontrada.'}</p>
        <Link to="/edicoes" className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-colors">
          Voltar para o arquivo
        </Link>
      </div>
    );
  }

  const { edition, items } = data;
  const readingTime = Math.max(1, Math.ceil(items.length * 1.5));
  const formattedDate = new Date(edition.edition_date).toLocaleDateString('pt-BR', { 
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
  });
  const canonicalUrl = `https://techndevn.com/edicoes/${slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": edition.title,
    "image": items.filter(i => i.main_image).map(i => i.main_image),
    "datePublished": new Date(edition.edition_date).toISOString(),
    "dateModified": new Date(edition.edition_date).toISOString(),
    "author": [{
        "@type": "Organization",
        "name": "Tech & Development Newsletter",
        "url": "https://techndevn.com/"
    }],
    "publisher": {
        "@type": "Organization",
        "name": "Tech & Development Newsletter",
        "logo": "https://techndevn.com/Banner.png"
    },
    "description": edition.description,
    "hasPart": items.map(item => ({
      "@type": "WebPageElement",
      "name": item.title,
      "url": item.original_link
    }))
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col text-white selection:bg-primary/30">
      <Helmet>
        <title>{edition.title} | Tech & Development Newsletter</title>
        <meta name="description" content={edition.description} />
        <link rel="canonical" href={canonicalUrl} />
        
        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={edition.title} />
        <meta property="og:description" content={edition.description} />
        <meta property="og:image" content={items.find(i => i.main_image)?.main_image || "https://techndevn.com/Banner.png"} />
        <meta name="twitter:card" content="summary_large_image" />
        
        {/* JSON-LD */}
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      </Helmet>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
        <div className="container mx-auto px-4 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold tracking-tight text-white hover:opacity-80 transition-opacity">
            Tech&<span className="text-primary">Dev</span>
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
            <Link to="/categoria" className="hover:text-white transition-colors">
              Categorias
            </Link>
            <Link to="/edicoes" className="flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Arquivo
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8 overflow-x-auto pb-2">
          <Link to="/" className="hover:text-white transition-colors">Início</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
          <Link to="/edicoes" className="hover:text-white transition-colors">Arquivo de Edições</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
          <span className="text-primary font-semibold truncate">{edition.title}</span>
        </nav>

        {/* Edition Header */}
        <div className="text-center mb-16">
          <div className="text-primary text-xs font-bold uppercase tracking-widest mb-4 bg-primary/10 px-3 py-1.5 rounded-full inline-block">
            {formattedDate}
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-6 leading-tight">
            {edition.title}
          </h1>
          <p className="text-lg text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
            {edition.description}
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-gray-400 bg-white/5 py-2.5 px-5 rounded-full w-fit mx-auto border border-white/5">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Leitura de {readingTime} min
            </span>
            <span className="text-gray-600">•</span>
            <span className="flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-purple-400" />
              {items.length} notícias selecionadas
            </span>
          </div>
        </div>

        {/* CTA Subscription Inline */}
        <div className="bg-gradient-to-r from-primary/10 via-purple-900/10 to-transparent border border-white/10 rounded-2xl p-6 md:p-8 mb-16 text-center">
          <h3 className="text-xl font-bold text-white mb-2">Receba a próxima edição em primeira mão</h3>
          <p className="text-gray-400 text-sm mb-6 max-w-xl mx-auto">Junte-se a milhares de desenvolvedores e receba nossa curadoria diária no seu e-mail.</p>
          <Link to="/" className="inline-block bg-primary text-white font-semibold px-8 py-3 rounded-xl text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
            Quero me inscrever gratuitamente
          </Link>
        </div>

        {/* News Items */}
        <div className="space-y-16">
          {items.map((item, index) => {
            const catSlug = getCategorySlug(item.category);
            const catName = getCategoryName(catSlug || item.category);

            return (
              <article key={item.id} className="relative bg-[#121212] border border-white/5 rounded-2xl p-6 md:p-8">
                <div className="absolute -top-4 -left-4 w-10 h-10 bg-primary/20 border border-primary/40 rounded-full flex items-center justify-center font-bold text-primary text-sm shadow-md">
                  {index + 1}
                </div>
                
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    {catSlug ? (
                      <Link 
                        to={`/categoria/${catSlug}`}
                        onClick={() => trackEvent('category_click', { category: catSlug, from: 'edition_detail' })}
                        className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full hover:bg-primary/20 transition-colors"
                      >
                        {catName}
                      </Link>
                    ) : (
                      <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">
                        {item.category || 'Tecnologia'}
                      </span>
                    )}
                    <span className="text-gray-400 text-xs font-medium bg-white/5 px-2.5 py-0.5 rounded">
                      {item.source_name || 'Fonte Oficial'}
                    </span>
                    {item.score && (
                      <span className="text-xs text-primary/90 font-medium ml-auto">
                        Score: <strong>{item.score}</strong>
                      </span>
                    )}
                  </div>

                  <a 
                    href={item.original_link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    onClick={() => trackEvent('news_click', { newsId: item.id, edition: slug })}
                    className="group"
                  >
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 leading-snug group-hover:text-primary transition-colors">
                      {item.title}
                    </h2>
                  </a>

                  {item.main_image && (
                    <a href={item.original_link} target="_blank" rel="noopener noreferrer" className="block my-3">
                      <img 
                        src={item.main_image} 
                        alt={item.title} 
                        loading="lazy"
                        decoding="async"
                        className="w-full h-64 sm:h-96 object-cover rounded-xl border border-white/5 opacity-95 hover:opacity-100 hover:scale-[1.01] transition-all"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </a>
                  )}

                  <p className="text-base sm:text-lg text-gray-300 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                    <a 
                      href={item.original_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center font-semibold text-sm text-primary hover:underline transition-colors"
                    >
                      Ler matéria original <ExternalLink className="w-4 h-4 ml-1.5" />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Footer Navigation */}
        <div className="mt-20 pt-8 border-t border-white/5 flex justify-between items-center text-sm">
          <Link to="/edicoes" className="text-white font-semibold hover:text-primary transition-colors flex items-center">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao arquivo
          </Link>
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-gray-400 hover:text-white transition-colors font-medium">
            Voltar ao topo ↑
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
