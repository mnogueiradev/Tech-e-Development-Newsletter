import { useEffect, useState } from 'react';
import NewsCard from './NewsCard';
import api from '../services/api';

export default function TodayEdition() {
  const [edition, setEdition] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEdition = async () => {
      try {
        const response = await api.get('/api/public/today-edition');
        if (response.data && response.data.items && response.data.items.length > 0) {
          setEdition(response.data);
        } else {
          setEdition(null);
        }
      } catch (error) {
        console.error('Error fetching today edition:', error);
        setEdition(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEdition();
  }, []);

  const SkeletonCard = () => (
    <div className="editorial-card rounded-md p-6 h-48 animate-pulse flex flex-col" aria-hidden="true">
      <div className="flex justify-between items-center mb-4">
        <div className="h-4 w-20 bg-brand-border rounded"></div>
        <div className="h-4 w-12 bg-brand-border rounded"></div>
      </div>
      <div className="h-6 w-full bg-brand-border rounded mb-2"></div>
      <div className="h-6 w-3/4 bg-brand-border rounded mb-4"></div>
      <div className="h-4 w-full bg-[#1A1D24] rounded mt-auto"></div>
    </div>
  );

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" aria-labelledby="today-edition-title">
      <div className="mb-10 text-center sm:text-left border-b border-brand-border pb-6">
        <h2 id="today-edition-title" className="text-3xl font-heading font-extrabold text-white mb-2">
          {edition?.editionTitle || 'A Edição de Hoje'}
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-brand-muted">
          {edition?.date && (
            <span className="font-medium text-white">
              {new Date(edition.date).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
            </span>
          )}
          {edition?.date && <span className="hidden sm:inline">•</span>}
          <span className="italic">Esta é a mesma edição enviada aos assinantes hoje às 08:00.</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : edition && edition.items?.length > 0 ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {edition.items.slice(0, 4).map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
          <div className="mt-12 text-center">
            <button className="inline-flex items-center justify-center px-8 py-3 border border-brand-border rounded text-sm font-semibold text-white bg-brand-card hover:bg-[#1A1D24] hover:border-brand-muted transition-colors cursor-pointer">
              Ler edição completa online
            </button>
          </div>
        </>
      ) : (
        <div className="editorial-card rounded-md p-12 text-center flex flex-col items-center justify-center border-dashed">
          <h3 className="text-xl font-heading font-semibold text-white mb-3">Edição em preparação</h3>
          <p className="text-brand-muted max-w-md mx-auto">
            Nossa equipe editorial ainda está selecionando e analisando as notícias de hoje. Inscreva-se acima para ser o primeiro a receber.
          </p>
        </div>
      )}
    </section>
  );
}
