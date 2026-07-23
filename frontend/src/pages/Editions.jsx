import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import api from '../services/api';
import Footer from '../components/Footer';

export default function Editions() {
  const [editions, setEditions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEditions = async () => {
      try {
        const response = await api.get('/api/public/editions');
        setEditions(response.data || []);
      } catch (error) {
        console.error('Error fetching editions:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchEditions();
  }, []);

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col font-sans text-brand-body">
      <Helmet>
        <title>Arquivo de Edições | Tech & Development Newsletter</title>
        <meta name="description" content="Explore o arquivo completo de edições passadas da Tech & Development Newsletter. As principais notícias de tecnologia e desenvolvimento." />
        <link rel="canonical" href="https://techndevn.com/edicoes" />
      </Helmet>

      {/* Simple Header */}
      <header className="border-b border-brand-border bg-[#0a0c10] py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-heading font-bold text-white tracking-tight hover:text-brand-accent transition-colors">
            Tech & Dev<span className="text-brand-accent">.</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-brand-muted hover:text-white transition-colors">
            Voltar para a Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12">
          <h1 className="text-4xl sm:text-5xl font-heading font-extrabold text-white tracking-tight mb-4">
            Arquivo de Edições
          </h1>
          <p className="text-lg text-brand-muted max-w-2xl">
            Navegue pelo nosso acervo de newsletters passadas. Todas as edições que já enviamos para nossos assinantes, disponíveis gratuitamente para você.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="editorial-card h-48 rounded-md animate-pulse p-6">
                <div className="h-4 w-24 bg-brand-border rounded mb-4"></div>
                <div className="h-6 w-full bg-brand-border rounded mb-2"></div>
                <div className="h-6 w-2/3 bg-brand-border rounded mb-6"></div>
                <div className="h-4 w-16 bg-[#1A1D24] rounded mt-auto"></div>
              </div>
            ))}
          </div>
        ) : editions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {editions.map((edition) => (
              <Link 
                key={edition.id} 
                to={`/edicoes/${edition.slug}`}
                className="editorial-card rounded-md p-6 flex flex-col group cursor-pointer"
              >
                <div className="text-xs font-bold text-brand-accent mb-3 uppercase tracking-wider">
                  {new Date(edition.edition_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
                <h2 className="text-xl font-heading font-bold text-white mb-2 group-hover:text-brand-accent transition-colors">
                  {edition.title}
                </h2>
                <p className="text-sm text-brand-muted line-clamp-2 mb-6">
                  {edition.description}
                </p>
                <div className="mt-auto flex justify-between items-center text-xs font-medium text-brand-muted border-t border-brand-border pt-4">
                  <span>{edition.newsCount} notícias</span>
                  <span className="flex items-center text-white group-hover:text-brand-accent transition-colors">
                    Ler edição
                    <svg className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 border border-brand-border border-dashed rounded-md">
            <h3 className="text-xl font-heading font-semibold text-white mb-2">Nenhuma edição encontrada</h3>
            <p className="text-brand-muted">O arquivo de edições ainda está vazio.</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
