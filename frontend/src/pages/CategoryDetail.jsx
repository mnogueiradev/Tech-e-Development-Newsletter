import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Clock, ExternalLink, Flame, Sparkles, TrendingUp, ChevronRight, Mail, BookOpen, Layers, CheckCircle, ShieldCheck, Cpu, Code2, Cloud, Rocket, Smartphone, Terminal } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import Footer from '../components/Footer';
import NewsCard from '../components/NewsCard';
import { trackEvent } from '../utils/analytics';

const CATEGORY_ICONS = {
  'ia': <Cpu className="w-10 h-10 text-primary" />,
  'ciberseguranca': <ShieldCheck className="w-10 h-10 text-red-400" />,
  'desenvolvimento': <Code2 className="w-10 h-10 text-blue-400" />,
  'cloud': <Cloud className="w-10 h-10 text-cyan-400" />,
  'startups': <Rocket className="w-10 h-10 text-amber-400" />,
  'hardware': <Cpu className="w-10 h-10 text-emerald-400" />,
  'mobile': <Smartphone className="w-10 h-10 text-indigo-400" />,
  'devops': <Terminal className="w-10 h-10 text-purple-400" />
};

export default function CategoryDetail() {
    const { slug } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    
    const initialPage = parseInt(searchParams.get('page') || '1', 10);
    const initialSort = searchParams.get('sort') || 'score';

    const [category, setCategory] = useState(null);
    const [news, setNews] = useState([]);
    const [sidebar, setSidebar] = useState({ topWeeklyNews: [], recentEditions: [], relatedCategories: [] });
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sort, setSort] = useState(initialSort);
    const [page, setPage] = useState(initialPage);
    
    // Formulário de Inscrição Inline
    const [subscribeEmail, setSubscribeEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchCategoryData = async () => {
            try {
                setLoading(true);
                const response = await api.get(`/api/public/categories/${slug}?page=${page}&limit=12&sort=${sort}`);
                setCategory(response.data.category);
                setNews(response.data.news || []);
                setSidebar(response.data.sidebar || { topWeeklyNews: [], recentEditions: [], relatedCategories: [] });
                setPagination(response.data.pagination);
                setLoading(false);
            } catch (err) {
                console.error('Erro ao buscar dados da categoria:', err);
                setError('Categoria não encontrada ou sem artigos no momento.');
                setLoading(false);
            }
        };

        fetchCategoryData();
    }, [slug, page, sort]);

    const handleSortChange = (newSort) => {
        setSort(newSort);
        setPage(1);
        setSearchParams({ sort: newSort, page: '1' });
        trackEvent('category_sort_change', { category: slug, sort: newSort });
    };

    const handlePageChange = (newPage) => {
        setPage(newPage);
        setSearchParams({ sort, page: newPage.toString() });
        window.scrollTo({ top: 300, behavior: 'smooth' });
    };

    const handleSubscribe = async (e) => {
        e.preventDefault();
        if (!subscribeEmail) return;

        try {
            setSubmitting(true);
            await api.post('/subscribe', {
                email: subscribeEmail,
                topic: slug || 'tecnologia'
            });
            toast.success('Inscrição realizada com sucesso! Verifique seu e-mail.');
            setSubscribeEmail('');
            trackEvent('newsletter_subscribe', { category: slug, location: 'category_hero' });
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Erro ao inscrever. Tente novamente.';
            toast.error(errorMsg);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading && !category) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error || !category) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white px-4">
                <h1 className="text-4xl font-bold mb-4">404</h1>
                <p className="text-gray-400 mb-8">{error || 'Categoria não encontrada.'}</p>
                <Link to="/categoria" className="text-primary hover:text-white transition-colors flex items-center gap-2 font-medium">
                    <ArrowLeft size={20} />
                    Ver todas as categorias
                </Link>
            </div>
        );
    }

    const canonicalUrl = `https://techndevn.com/categoria/${category.slug}`;
    const metaTitle = `Notícias de ${category.name} | Tech & Development Newsletter`;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": metaTitle,
        "description": category.description,
        "url": canonicalUrl,
        "publisher": {
            "@type": "Organization",
            "name": "Tech & Development Newsletter",
            "logo": "https://techndevn.com/Banner.png"
        },
        "mainEntity": {
            "@type": "ItemList",
            "itemListElement": news.map((item, index) => ({
                "@type": "ListItem",
                "position": index + 1,
                "url": item.original_link,
                "name": item.title
            }))
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-primary/30 flex flex-col">
            <Helmet>
                <title>{metaTitle}</title>
                <meta name="description" content={category.description} />
                <link rel="canonical" href={canonicalUrl} />
                <meta property="og:title" content={metaTitle} />
                <meta property="og:description" content={category.description} />
                <meta property="og:url" content={canonicalUrl} />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={metaTitle} />
                <meta name="twitter:description" content={category.description} />
                <script type="application/ld+json">
                    {JSON.stringify(jsonLd)}
                </script>
            </Helmet>

            {/* Header minimalista */}
            <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
                <div className="container mx-auto px-4 lg:px-8 h-20 flex items-center justify-between">
                    <Link to="/" className="text-2xl font-bold tracking-tight text-white hover:opacity-80 transition-opacity">
                        Tech&<span className="text-primary">Dev</span>
                    </Link>
                    <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
                        <Link to="/categoria" className="hover:text-white transition-colors">
                            Todas as Categorias
                        </Link>
                        <Link to="/edicoes" className="hover:text-white transition-colors">
                            Arquivo
                        </Link>
                    </div>
                </div>
            </header>

            <main className="flex-1 container mx-auto px-4 lg:px-8 py-10 max-w-7xl">
                
                {/* Breadcrumb Navigation */}
                <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8 overflow-x-auto pb-2">
                    <Link to="/" className="hover:text-white transition-colors">Início</Link>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                    <Link to="/categoria" className="hover:text-white transition-colors">Categorias</Link>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                    <span className="text-primary font-semibold truncate">{category.name}</span>
                </nav>

                {/* Hero da Categoria */}
                <div className="relative bg-gradient-to-br from-[#141417] via-[#101014] to-[#0c0c0e] border border-white/10 rounded-3xl p-6 md:p-10 mb-12 overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-0 pointer-events-none"></div>

                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        <div className="lg:col-span-8">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="bg-white/5 p-3 rounded-2xl ring-1 ring-white/10">
                                    {CATEGORY_ICONS[slug] || <Layers className="w-8 h-8 text-primary" />}
                                </div>
                                <div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">
                                        Hub Oficial
                                    </span>
                                    {category.articleCount > 0 && (
                                        <span className="ml-2 text-xs text-gray-400 font-medium">
                                            {category.articleCount} notícias organizadas
                                        </span>
                                    )}
                                </div>
                            </div>

                            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
                                {category.name}
                            </h1>

                            <p className="text-base md:text-lg text-gray-300 leading-relaxed mb-6 max-w-3xl">
                                {category.description}
                            </p>
                        </div>

                        {/* CTA de Inscrição Inline */}
                        <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-2xl p-5 md:p-6 backdrop-blur-sm">
                            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                                <Mail className="w-5 h-5 text-primary" />
                                Receba atualizações de {category.name}
                            </h3>
                            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                                As notícias mais pontuadas pela nossa curadoria na sua caixa de entrada.
                            </p>
                            <form onSubmit={handleSubscribe} className="space-y-3">
                                <input 
                                    type="email" 
                                    placeholder="seu.email@empresa.com"
                                    value={subscribeEmail}
                                    onChange={(e) => setSubscribeEmail(e.target.value)}
                                    required
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                                />
                                <button 
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {submitting ? 'Inscrevendo...' : 'Assinar Hub Grátis'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Conteúdo Principal + Sidebar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    
                    {/* Feed de Notícias (Col 8) */}
                    <div className="lg:col-span-8 space-y-6">
                        
                        {/* Controles de Ordenação */}
                        <div className="flex items-center justify-between pb-4 border-b border-white/5">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-primary" />
                                Artigos em {category.name}
                            </h2>

                            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl text-xs font-semibold">
                                <button 
                                    onClick={() => handleSortChange('score')}
                                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${sort === 'score' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Flame className="w-3.5 h-3.5" />
                                    Maior Score
                                </button>
                                <button 
                                    onClick={() => handleSortChange('recent')}
                                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${sort === 'recent' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Clock className="w-3.5 h-3.5" />
                                    Mais Recentes
                                </button>
                            </div>
                        </div>

                        {/* Listagem dos Cards */}
                        {loading ? (
                            <div className="flex justify-center py-16">
                                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
                            </div>
                        ) : news.length > 0 ? (
                            <div className="space-y-6">
                                {news.map(item => (
                                    <NewsCard key={item.id} item={item} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 border border-white/5 rounded-2xl bg-white/5 p-8">
                                <p className="text-gray-400 mb-4">Nenhuma notícia encontrada nesta categoria no momento.</p>
                                <Link to="/categoria" className="text-primary hover:underline text-sm font-semibold">
                                    Ver outras categorias →
                                </Link>
                            </div>
                        )}

                        {/* Paginação */}
                        {pagination && pagination.totalPages > 1 && (
                            <div className="pt-8 flex items-center justify-between border-t border-white/5">
                                <button 
                                    disabled={pagination.currentPage <= 1}
                                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                                    className="px-5 py-2.5 rounded-xl font-medium text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white/5 text-white hover:bg-white/10"
                                >
                                    ← Anterior
                                </button>
                                
                                <span className="text-gray-400 text-xs font-semibold">
                                    Página {pagination.currentPage} de {pagination.totalPages}
                                </span>

                                <button 
                                    disabled={pagination.currentPage >= pagination.totalPages}
                                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                                    className="px-5 py-2.5 rounded-xl font-medium text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-primary/20 text-primary hover:bg-primary/30"
                                >
                                    Próxima →
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Sidebar (Col 4) */}
                    <aside className="lg:col-span-4 space-y-8">
                        
                        {/* Top 5 Notícias da Semana */}
                        {sidebar.topWeeklyNews && sidebar.topWeeklyNews.length > 0 && (
                            <div className="bg-[#121212] border border-white/5 rounded-2xl p-6">
                                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 pb-3 border-b border-white/5">
                                    <TrendingUp className="w-4 h-4 text-primary" />
                                    Top Notícias da Semana
                                </h3>
                                <ul className="space-y-4">
                                    {sidebar.topWeeklyNews.map((item, idx) => (
                                        <li key={item.id} className="group">
                                            <a 
                                                href={item.original_link} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                onClick={() => trackEvent('top_weekly_click', { newsId: item.id, category: slug })}
                                                className="flex items-start gap-3 text-xs"
                                            >
                                                <span className="font-extrabold text-primary text-sm shrink-0 w-4">
                                                    0{idx + 1}
                                                </span>
                                                <div>
                                                    <h4 className="font-medium text-gray-200 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                                                        {item.title}
                                                    </h4>
                                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                                                        <span>{item.source_name || 'Fonte'}</span>
                                                        <span>•</span>
                                                        <span className="text-primary/80 font-semibold">Score: {item.score}</span>
                                                    </div>
                                                </div>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Edições Recentes com esta categoria */}
                        {sidebar.recentEditions && sidebar.recentEditions.length > 0 && (
                            <div className="bg-[#121212] border border-white/5 rounded-2xl p-6">
                                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 pb-3 border-b border-white/5">
                                    <BookOpen className="w-4 h-4 text-purple-400" />
                                    Edições Relacionadas
                                </h3>
                                <div className="space-y-3">
                                    {sidebar.recentEditions.map((ed) => (
                                        <Link 
                                            key={ed.slug} 
                                            to={`/edicoes/${ed.slug}`}
                                            className="block p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-xs group"
                                        >
                                            <div className="font-semibold text-white group-hover:text-primary transition-colors">
                                                {ed.title}
                                            </div>
                                            <div className="text-gray-400 mt-1 text-[11px]">
                                                {new Date(ed.edition_date).toLocaleDateString('pt-BR')}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Outras Categorias Relacionadas */}
                        {sidebar.relatedCategories && sidebar.relatedCategories.length > 0 && (
                            <div className="bg-[#121212] border border-white/5 rounded-2xl p-6">
                                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 pb-3 border-b border-white/5">
                                    <Layers className="w-4 h-4 text-cyan-400" />
                                    Outros Hubs de Tecnologia
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {sidebar.relatedCategories.map(cat => (
                                        <Link 
                                            key={cat.slug} 
                                            to={`/categoria/${cat.slug}`}
                                            className="text-xs bg-white/5 hover:bg-primary/20 hover:text-primary text-gray-300 px-3 py-1.5 rounded-full transition-colors font-medium border border-white/5"
                                        >
                                            {cat.name} ({cat.articleCount})
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                    </aside>
                </div>

            </main>

            <Footer />
        </div>
    );
}
