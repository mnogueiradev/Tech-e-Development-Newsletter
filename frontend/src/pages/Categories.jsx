import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';
import api from '../services/api';
import { Cpu, ShieldCheck, Code2, Cloud, Rocket, Smartphone, Terminal, ArrowRight, Home as HomeIcon } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

const CATEGORY_ICONS = {
  'ia': <Cpu className="w-8 h-8 text-primary" />,
  'ciberseguranca': <ShieldCheck className="w-8 h-8 text-red-400" />,
  'desenvolvimento': <Code2 className="w-8 h-8 text-blue-400" />,
  'cloud': <Cloud className="w-8 h-8 text-cyan-400" />,
  'startups': <Rocket className="w-8 h-8 text-amber-400" />,
  'hardware': <Cpu className="w-8 h-8 text-emerald-400" />,
  'mobile': <Smartphone className="w-8 h-8 text-indigo-400" />,
  'devops': <Terminal className="w-8 h-8 text-purple-400" />
};

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get('/api/public/categories');
        setCategories(response.data);
      } catch (error) {
        console.error("Erro ao carregar categorias:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Hubs Editoriais de Tecnologia | Tech & Development Newsletter",
    "description": "Explore notícias curadas por verticais temáticas: IA, Cibersegurança, Desenvolvimento, Cloud Computing, Startups, Hardware, Mobile e DevOps.",
    "url": "https://techndevn.com/categoria",
    "publisher": {
      "@type": "Organization",
      "name": "Tech & Development Newsletter",
      "logo": "https://techndevn.com/Banner.png"
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-white selection:bg-primary/30">
      <Helmet>
        <title>Hubs Editoriais de Tecnologia | Tech & Development Newsletter</title>
        <meta name="description" content="Navegue pelas verticais de IA, Cibersegurança, Desenvolvimento de Software, Cloud Computing, Startups, Hardware, Mobile e DevOps." />
        <link rel="canonical" href="https://techndevn.com/categoria" />
        <meta property="og:title" content="Hubs Editoriais de Tecnologia | Tech & Development Newsletter" />
        <meta property="og:description" content="Exploração técnica por categorias: notícias, tendências e análises curadas sobre desenvolvimento e inovação." />
        <meta property="og:url" content="https://techndevn.com/categoria" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      </Helmet>

      {/* Header Minimalista */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
        <div className="container mx-auto px-4 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold tracking-tight text-white hover:opacity-80 transition-opacity">
            Tech&<span className="text-primary">Dev</span>
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
            <Link to="/edicoes" className="hover:text-white transition-colors">
              Arquivo de Edições
            </Link>
            <Link to="/" className="hover:text-white transition-colors flex items-center gap-1.5 text-primary font-semibold">
              <HomeIcon className="w-4 h-4" />
              Início
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-grow pt-12 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Hero */}
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-6">
              Hubs de Conhecimento
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight text-white leading-tight">
              Nossos <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-pink-500">Hubs Editoriais</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 leading-relaxed">
              Explore o ecossistema de tecnologia através das nossas 8 verticais canônicas. Notícias selecionadas com algoritmo de scoring editorial e precisão técnica.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-24">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {categories.map((cat) => (
                <Link 
                  key={cat.slug} 
                  to={`/categoria/${cat.slug}`}
                  onClick={() => trackEvent('category_click', { category: cat.slug })}
                  className="group relative bg-[#121212] border border-white/5 rounded-2xl p-6 hover:border-primary/40 transition-all duration-300 overflow-hidden flex flex-col justify-between"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="bg-white/5 p-3.5 rounded-xl w-fit mb-5 ring-1 ring-white/10 group-hover:ring-primary/40 group-hover:bg-primary/10 transition-all duration-300">
                      {CATEGORY_ICONS[cat.slug] || <Code2 className="w-8 h-8 text-primary" />}
                    </div>
                    
                    <h2 className="text-2xl font-bold text-white mb-3 group-hover:text-primary transition-colors">
                      {cat.name}
                    </h2>
                    
                    <p className="text-sm text-gray-400 flex-grow mb-6 leading-relaxed line-clamp-3">
                      {cat.description}
                    </p>
                    
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                      <span className="text-xs font-semibold text-gray-400 bg-white/5 px-2.5 py-1 rounded-full group-hover:text-white transition-colors">
                        {cat.articleCount || 0} artigos
                      </span>
                      <span className="text-primary text-sm font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform duration-300">
                        Explorar <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}
