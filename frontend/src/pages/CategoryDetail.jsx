import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Clock, ExternalLink } from 'lucide-react';
import api from '../services/api';
import Footer from '../components/Footer';
import NewsCard from '../components/NewsCard';

export default function CategoryDetail() {
    const { slug } = useParams();
    const [category, setCategory] = useState(null);
    const [news, setNews] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCategory = async () => {
            try {
                setLoading(true);
                const response = await api.get(`/public/categories/${slug}`);
                setCategory(response.data.category);
                setNews(response.data.news);
                setPagination(response.data.pagination);
                setLoading(false);
            } catch (err) {
                console.error('Error fetching category:', err);
                setError('Categoria não encontrada.');
                setLoading(false);
            }
        };

        fetchCategory();
    }, [slug]);

    if (loading) {
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
                <Link to="/" className="text-primary hover:text-white transition-colors flex items-center gap-2">
                    <ArrowLeft size={20} />
                    Voltar para a Home
                </Link>
            </div>
        );
    }

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": `Notícias sobre ${category.name} | Tech & Development Newsletter`,
        "description": category.description,
        "url": `https://techndevn.com/categoria/${category.slug}`,
        "publisher": {
            "@type": "Organization",
            "name": "Tech & Development Newsletter",
            "logo": {
                "@type": "ImageObject",
                "url": "https://techndevn.com/logo.png"
            }
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
        <div className="min-h-screen bg-[#0a0a0a] selection:bg-primary/30 selection:text-white flex flex-col">
            <Helmet>
                <title>{category.name} | Tech & Development</title>
                <meta name="description" content={category.description} />
                <link rel="canonical" href={`https://techndevn.com/categoria/${category.slug}`} />
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
                    <Link to="/edicoes" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                        Arquivo
                    </Link>
                </div>
            </header>

            <main className="flex-1 container mx-auto px-4 lg:px-8 py-12 lg:py-20 max-w-5xl">
                
                {/* Hero Section */}
                <div className="mb-16">
                    <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8 group">
                        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        Voltar para o início
                    </Link>
                    
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
                        {category.name}
                    </h1>
                    <p className="text-lg text-gray-400 max-w-2xl leading-relaxed">
                        {category.description}
                    </p>
                </div>

                {/* Grid de Notícias */}
                <div className="space-y-6">
                    {news.map(item => (
                        <NewsCard key={item.id} item={item} />
                    ))}
                    
                    {news.length === 0 && (
                        <div className="text-center py-20 border border-white/5 rounded-2xl bg-white/5">
                            <p className="text-gray-400">Nenhuma notícia encontrada para esta categoria ainda.</p>
                        </div>
                    )}
                </div>

                {/* Paginação */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="mt-16 flex items-center justify-center gap-4">
                        <button 
                            disabled={pagination.currentPage === 1}
                            className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-white/5 text-white hover:bg-white/10"
                        >
                            Página Anterior
                        </button>
                        <span className="text-gray-400 text-sm font-medium">
                            {pagination.currentPage} de {pagination.totalPages}
                        </span>
                        <button 
                            disabled={pagination.currentPage === pagination.totalPages}
                            className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-primary/10 text-primary hover:bg-primary/20"
                        >
                            Próxima Página
                        </button>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}
