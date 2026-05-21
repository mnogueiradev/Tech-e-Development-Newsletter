import { CheckCircle, XCircle, Star, Archive, MoreHorizontal, ExternalLink } from "lucide-react";

interface NewsTableProps {
  news: any[];
  onAction: (id: number, action: string) => void;
  onViewDetails: (newsItem: any) => void;
}

export function NewsTable({ news, onAction, onViewDetails }: NewsTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aprovada': return <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20">Aprovada</span>;
      case 'rejeitada': return <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs rounded-full border border-red-500/20">Rejeitada</span>;
      case 'destacada': return <span className="px-2 py-1 bg-purple-500/10 text-purple-400 text-xs rounded-full border border-purple-500/20">Destaque</span>;
      case 'arquivada': return <span className="px-2 py-1 bg-gray-500/10 text-gray-400 text-xs rounded-full border border-gray-500/20">Arquivada</span>;
      default: return <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full border border-blue-500/20">Pendente</span>;
    }
  };

  if (!news || news.length === 0) {
    return <div className="p-8 text-center text-gray-500 bg-white/5 rounded-xl border border-white/10">Nenhuma notícia encontrada.</div>;
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-x-auto">
      <table className="w-full text-left text-sm text-gray-400">
        <thead className="text-xs text-gray-500 uppercase bg-black/20 border-b border-white/10">
          <tr>
            <th className="px-4 py-3">Notícia</th>
            <th className="px-4 py-3 w-32">Fonte</th>
            <th className="px-4 py-3 w-24">Score</th>
            <th className="px-4 py-3 w-32">Status</th>
            <th className="px-4 py-3 w-32 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {news.map(item => (
            <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
              <td className="px-4 py-3 cursor-pointer" onClick={() => onViewDetails(item)}>
                <div className="flex items-center gap-3">
                  {item.main_image ? (
                    <img src={item.main_image} alt="" className="w-10 h-10 rounded-lg object-cover bg-black/20 border border-white/10" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-black/20 border border-white/10 flex items-center justify-center">?</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium line-clamp-1 group-hover:text-purple-400 transition-colors">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(item.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="bg-white/10 px-2 py-1 rounded text-xs">{item.source_name || 'Desconhecida'}</span>
              </td>
              <td className="px-4 py-3">
                <strong className={`text-sm ${item.score > 70 ? 'text-green-400' : item.score > 40 ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {item.score}
                </strong>
              </td>
              <td className="px-4 py-3">
                {getStatusBadge(item.status)}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onAction(item.id, 'aprovada')} title="Aprovar" className="p-1 hover:text-green-400"><CheckCircle size={16} /></button>
                  <button onClick={() => onAction(item.id, 'rejeitada')} title="Rejeitar" className="p-1 hover:text-red-400"><XCircle size={16} /></button>
                  <button onClick={() => onAction(item.id, 'destacada')} title="Destacar" className="p-1 hover:text-purple-400"><Star size={16} /></button>
                  <a href={item.original_link} target="_blank" rel="noreferrer" title="Ler Original" className="p-1 hover:text-blue-400"><ExternalLink size={16} /></a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
