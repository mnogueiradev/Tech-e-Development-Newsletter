import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Clock, ExternalLink } from 'lucide-react';
import api from '../services/api';
import Footer from '../components/Footer';

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
      <div className="min-h-screen bg-brand-dark flex flex-col font-sans text-brand-body items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-accent"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-brand-dark flex flex-col font-sans text-brand-body items-center justify-center p-4">
        <h1 className="text-3xl font-heading font-bold text-white mb-4">Oops!</h1>
        <p className="text-brand-muted mb-8">{error || 'Algo deu errado.'}</p>
        <Link to="/edicoes" className="px-6 py-2 bg-brand-card text-white border border-brand-border rounded font-semibold hover:border-brand-muted transition-colors">
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

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col font-sans text-brand-body">
      <Helmet>
        <title>{edition.title} | Tech & Development Newsletter</title>
        <meta name="description" content={edition.description} />
        <link rel="canonical" href={canonicalUrl} />
        
        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={edition.title} />
        <meta property="og:description" content={edition.description} />
        {/* Usando o banner padrão como fallback */}
        <meta property="og:image" content="https://techndevn.com/og-image.jpg" />
      </Helmet>

      {/* Header */}
      <header className="border-b border-brand-border bg-[#0a0c10] py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-heading font-bold text-white tracking-tight hover:text-brand-accent transition-colors">
            Tech & Dev<span className="text-brand-accent">.</span>
          </Link>
          <Link to="/edicoes" className="flex items-center text-sm font-medium text-brand-muted hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Arquivo
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        
        {/* Edition Header */}
        <div className="text-center mb-16">
          <div className="text-brand-accent text-sm font-bold uppercase tracking-widest mb-4">
            {formattedDate}
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-extrabold text-white tracking-tight mb-6 leading-tight">
            {edition.title}
          </h1>
          <p className="text-xl text-brand-muted mb-8 max-w-2xl mx-auto">
            {edition.description}
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-brand-muted">
            <Clock className="w-4 h-4" />
            <span>Leitura de {readingTime} min</span>
            <span className="mx-2">•</span>
            <span>{items.length} notícias selecionadas</span>
          </div>
        </div>

        {/* CTA Subscription Inline */}
        <div className="bg-[#1A1D24] border border-brand-border rounded-md p-6 mb-16 text-center">
          <h3 className="text-lg font-heading font-bold text-white mb-2">Receba a próxima edição antes de todo mundo</h3>
          <p className="text-brand-muted text-sm mb-4">Junte-se à nossa comunidade e receba a curadoria no seu e-mail, de graça.</p>
          <Link to="/" className="inline-block bg-brand-accent text-[#0a0c10] font-bold px-6 py-2 rounded text-sm hover:bg-amber-400 transition-colors">
            Quero me inscrever
          </Link>
        </div>

        {/* News Items */}
        <div className="space-y-16">
          {items.map((item, index) => (
            <article key={item.id} className="relative">
              <div className="absolute -left-12 top-0 text-5xl font-heading font-black text-[#1A1D24] hidden md:block">
                {index + 1}
              </div>
              
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-accent bg-[#1A1D24] px-3 py-1 rounded">
                    {item.category || 'Tecnologia'}
                  </span>
                  <span className="text-brand-muted text-sm font-medium">
                    {item.source_name || 'Fonte desconhecida'}
                  </span>
                  <span className="text-brand-muted text-sm font-medium ml-auto">
                    Score: {item.score}
                  </span>
                </div>

                <a href={item.original_link} target="_blank" rel="noopener noreferrer" className="group">
                  <h2 className="text-2xl sm:text-3xl font-heading font-bold text-white mb-4 leading-tight group-hover:text-brand-accent transition-colors">
                    {item.title}
                  </h2>
                </a>

                {item.main_image && (
                  <a href={item.original_link} target="_blank" rel="noopener noreferrer" className="block my-4">
                    <img 
                      src={item.main_image} 
                      alt={item.title} 
                      className="w-full h-64 sm:h-96 object-cover rounded-md border border-brand-border opacity-90 hover:opacity-100 transition-opacity"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </a>
                )}

                <p className="text-base sm:text-lg text-brand-muted leading-relaxed">
                  {item.description}
                </p>

                <div className="mt-4">
                  <a 
                    href={item.original_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center font-semibold text-white hover:text-brand-accent transition-colors"
                  >
                    Ler matéria original <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
                </div>
              </div>
              
              {index < items.length - 1 && (
                <div className="w-16 h-[1px] bg-brand-border mt-16 mx-auto"></div>
              )}
            </article>
          ))}
        </div>

        {/* Footer Navigation */}
        <div className="mt-20 pt-10 border-t border-brand-border flex justify-between items-center">
          <Link to="/edicoes" className="text-white font-semibold hover:text-brand-accent transition-colors flex items-center">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao arquivo
          </Link>
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-sm text-brand-muted hover:text-white transition-colors">
            Voltar ao topo
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
