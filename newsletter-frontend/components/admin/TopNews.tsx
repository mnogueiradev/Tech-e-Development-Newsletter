import { TrendingUp, ExternalLink } from "lucide-react";

interface NewsItem {
  id: number;
  title: string;
  source: string;
  score: number;
  created_at: string;
}

export function TopNews({ news }: { news: NewsItem[] }) {
  if (!news || news.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-full">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="text-purple-400" size={20} />
          <h3 className="text-lg font-bold text-white">Top Notícias de Hoje</h3>
        </div>
        <p className="text-gray-500 text-sm">Nenhuma notícia coletada hoje.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-full">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="text-purple-400" size={20} />
        <h3 className="text-lg font-bold text-white">Top Notícias de Hoje</h3>
      </div>
      
      <div className="space-y-4">
        {news.map((item, i) => (
          <div key={item.id} className="flex gap-4 items-start p-3 rounded-xl hover:bg-white/5 transition-colors group">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 font-bold text-sm border border-purple-500/20">
              #{i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-white text-sm font-medium line-clamp-2 leading-tight group-hover:text-purple-300 transition-colors">
                {item.title}
              </h4>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span className="bg-white/10 px-2 py-0.5 rounded text-gray-300">{item.source}</span>
                <span>Score: <strong className="text-green-400">{item.score}</strong></span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
