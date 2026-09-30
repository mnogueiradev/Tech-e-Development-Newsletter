"use client";

import { ThumbsUp, ThumbsDown, Users, BarChart2, Newspaper } from "lucide-react";

interface FeedbackStats {
  totalVotes: number;
  totalUpvotes: number;
  totalDownvotes: number;
  uniqueVoters: number;
  newsEvaluated: number;
}

interface TopRatedItem {
  id: number;
  title: string;
  original_link: string;
  category: string;
  upvotes: number;
  downvotes: number;
  total_feedback: number;
}

interface FeedbackSectionProps {
  stats: FeedbackStats;
  topRated: TopRatedItem[];
}

export function FeedbackSection({ stats, topRated }: FeedbackSectionProps) {
  const approvalRate =
    stats.totalVotes > 0
      ? Math.round((stats.totalUpvotes / stats.totalVotes) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Total de Votos</span>
          <span className="text-2xl font-bold text-white">{stats.totalVotes}</span>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-green-400 uppercase tracking-wide flex items-center gap-1">
            <ThumbsUp size={12} /> Gostei
          </span>
          <span className="text-2xl font-bold text-green-400">{stats.totalUpvotes}</span>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-red-400 uppercase tracking-wide flex items-center gap-1">
            <ThumbsDown size={12} /> Não Gostei
          </span>
          <span className="text-2xl font-bold text-red-400">{stats.totalDownvotes}</span>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-blue-400 uppercase tracking-wide flex items-center gap-1">
            <BarChart2 size={12} /> Aprovação
          </span>
          <span className="text-2xl font-bold text-blue-400">{approvalRate}%</span>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-400">
        <span className="flex items-center gap-1.5">
          <Users size={14} className="text-purple-400" />
          <strong className="text-white">{stats.uniqueVoters}</strong> leitores participaram
        </span>
        <span className="flex items-center gap-1.5">
          <Newspaper size={14} className="text-purple-400" />
          <strong className="text-white">{stats.newsEvaluated}</strong> notícias avaliadas
        </span>
      </div>

      {/* Top Rated News Table */}
      {topRated.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center text-gray-500">
          Nenhum feedback registrado ainda. Os votos aparecerão aqui depois do primeiro envio.
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="font-semibold text-white">Notícias Avaliadas pelos Leitores</h3>
            <p className="text-xs text-gray-400 mt-0.5">Ordenadas por votos positivos</p>
          </div>
          <div className="divide-y divide-white/5">
            {topRated.map((item, idx) => {
              const total = Number(item.upvotes) + Number(item.downvotes);
              const pct = total > 0 ? Math.round((Number(item.upvotes) / total) * 100) : 0;
              return (
                <div key={item.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-3">
                  {/* Rank */}
                  <span className="text-2xl font-bold text-white/20 w-8 shrink-0">
                    {idx + 1}
                  </span>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <a
                      href={item.original_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-white hover:text-blue-400 transition-colors line-clamp-2"
                    >
                      {item.title}
                    </a>
                    <span className="text-xs text-gray-500 mt-0.5 block">
                      #{item.id} · {item.category || "Sem categoria"}
                    </span>
                  </div>

                  {/* Votes */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="flex items-center gap-1 text-green-400 text-sm font-semibold">
                      <ThumbsUp size={14} /> {Number(item.upvotes)}
                    </span>
                    <span className="flex items-center gap-1 text-red-400 text-sm font-semibold">
                      <ThumbsDown size={14} /> {Number(item.downvotes)}
                    </span>
                    {/* Approval bar */}
                    <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden hidden md:block">
                      <div
                        className="h-full bg-green-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 hidden md:block w-8 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
