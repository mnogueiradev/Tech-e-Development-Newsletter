import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import api from '../services/api';
import { FolderHeart, ShieldCheck, Code2, Server, Smartphone, BookOpen, Layers } from 'lucide-react';

const CATEGORY_ICONS = {
  'ia': <FolderHeart className="w-8 h-8 text-primary" />,
  'ciberseguranca': <ShieldCheck className="w-8 h-8 text-red-500" />,
  'desenvolvimento': <Code2 className="w-8 h-8 text-blue-500" />,
  'infraestrutura': <Server className="w-8 h-8 text-gray-400" />,
  'mobile': <Smartphone className="w-8 h-8 text-green-500" />,
  'carreira': <BookOpen className="w-8 h-8 text-yellow-500" />,
  'geral': <Layers className="w-8 h-8 text-purple-500" />
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

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30">
      <Helmet>
        <title>Categorias | Tech & Development</title>
        <meta name="description" content="Explore nossas categorias de notícias sobre IA, Cibersegurança, Desenvolvimento, Infraestrutura e muito mais." />
      </Helmet>

      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 font-space-grotesk tracking-tight text-white">
              Nossos <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">Hubs Editoriais</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Explore o ecossistema de tecnologia através das nossas verticais. Cobertura premium com curadoria humana e precisão técnica.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((cat) => (
                <Link 
                  key={cat.slug} 
                  to={`/categoria/${cat.slug}`}
                  className="group relative bg-surface border border-white/5 rounded-2xl p-8 hover:border-primary/50 transition-all duration-500 overflow-hidden"
                >
                  {/* Efeito de brilho no hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="bg-white/5 p-4 rounded-xl w-fit mb-6 ring-1 ring-white/10 group-hover:ring-primary/30 group-hover:bg-primary/10 transition-all duration-300">
                      {CATEGORY_ICONS[cat.slug] || <Layers className="w-8 h-8 text-primary" />}
                    </div>
                    
                    <h2 className="text-2xl font-bold text-white mb-3 group-hover:text-primary transition-colors">
                      {cat.name}
                    </h2>
                    
                    <p className="text-gray-400 flex-grow mb-6 line-clamp-3">
                      {cat.description}
                    </p>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-sm font-medium text-gray-500 bg-white/5 px-3 py-1 rounded-full group-hover:text-gray-300 transition-colors">
                        {cat.articleCount} artigos
                      </span>
                      <span className="text-primary font-medium opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 flex items-center gap-1">
                        Explorar <span className="text-lg">→</span>
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
