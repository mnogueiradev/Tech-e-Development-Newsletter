import { useState, useEffect } from "react";
import { X, ExternalLink, Save, CheckCircle, XCircle } from "lucide-react";

interface ModalProps {
  newsId: number | null;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://tech-e-development-newsletter.onrender.com";

export function NewsDetailsModal({ newsId, onClose, onStatusChange }: ModalProps) {
  const [news, setNews] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({ editorial_summary: '', internal_note: '' });
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!newsId) return;
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("admin_token");
        const res = await fetch(`${API_URL}/api/admin/news/${newsId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNews(data);
          let metadata = data.metadata || {};
          if (typeof metadata === 'string') metadata = JSON.parse(metadata);
          setNotes({
            editorial_summary: metadata.editorial_summary || '',
            internal_note: metadata.internal_note || ''
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [newsId]);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const token = localStorage.getItem("admin_token");
      await fetch(`${API_URL}/api/admin/news/${newsId}/notes`, {
        method: 'PATCH',
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(notes)
      });
      alert("Notas salvas com sucesso!");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar notas.");
    } finally {
      setSavingNotes(false);
    }
  };

  if (!newsId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Detalhes Editoriais</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center p-8"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>
          ) : !news ? (
            <div className="text-center text-red-400">Erro ao carregar notícia.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Info & Preview */}
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h1 className="text-xl font-bold text-white leading-tight mb-2">{news.title}</h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                    <span className="bg-white/10 px-2 py-1 rounded text-white">{news.source_name}</span>
                    <span>{new Date(news.created_at).toLocaleString('pt-BR')}</span>
                    <a href={news.original_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-purple-400 hover:underline">
                      Abrir Original <ExternalLink size={14} />
                    </a>
                  </div>
                </div>

                {news.main_image && (
                  <img src={news.main_image} alt="" className="w-full h-48 object-cover rounded-xl border border-white/10" />
                )}

                <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-gray-300 text-sm leading-relaxed">
                  <h3 className="text-gray-500 font-bold mb-2 uppercase text-xs">Resumo Original / Descrição</h3>
                  {news.description || 'Sem descrição.'}
                </div>

                <div className="space-y-3">
                  <h3 className="text-white font-bold">Curadoria Manual</h3>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Resumo para a Newsletter</label>
                    <textarea 
                      value={notes.editorial_summary}
                      onChange={e => setNotes({...notes, editorial_summary: e.target.value})}
                      className="w-full h-24 bg-black/20 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-purple-500 focus:outline-none"
                      placeholder="Escreva um resumo cativante aqui..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Notas Internas (Admin)</label>
                    <input 
                      type="text"
                      value={notes.internal_note}
                      onChange={e => setNotes({...notes, internal_note: e.target.value})}
                      className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-purple-500 focus:outline-none"
                      placeholder="Ex: Bom para terça-feira"
                    />
                  </div>
                  <button 
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    <Save size={16} /> Salvar Notas
                  </button>
                </div>
              </div>

              {/* Right Column: Score & Status */}
              <div className="space-y-6">
                <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                  <h3 className="text-gray-500 font-bold mb-3 uppercase text-xs">Ações Rápidas</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => onStatusChange(news.id, 'aprovada')} className="flex items-center justify-center gap-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 py-2 rounded-lg text-sm border border-green-500/20">
                      <CheckCircle size={16} /> Aprovar
                    </button>
                    <button onClick={() => onStatusChange(news.id, 'rejeitada')} className="flex items-center justify-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 py-2 rounded-lg text-sm border border-red-500/20">
                      <XCircle size={16} /> Rejeitar
                    </button>
                  </div>
                  <div className="mt-3 text-center">
                    <span className="text-xs text-gray-500">Status atual: <strong className="text-white uppercase">{news.status}</strong></span>
                  </div>
                </div>

                <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                  <h3 className="text-gray-500 font-bold mb-3 uppercase text-xs">Score IA Engine</h3>
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-4xl font-black text-purple-400">{news.score}</span>
                    <span className="text-sm text-gray-500 mb-1">/ 100</span>
                  </div>
                  
                  {typeof news.metadata === 'string' && JSON.parse(news.metadata)?.score_details && (
                    <div className="space-y-2 text-xs">
                      {JSON.parse(news.metadata).score_details.factors?.map((f: any, i: number) => (
                        <div key={i} className="flex justify-between items-center bg-white/5 p-2 rounded">
                          <span className="text-gray-300">{f.name}</span>
                          <span className={f.impact > 0 ? 'text-green-400' : 'text-red-400'}>
                            {f.impact > 0 ? '+' : ''}{f.impact}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                  <h3 className="text-gray-500 font-bold mb-3 uppercase text-xs">Tags & Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {news.tags && typeof news.tags === 'string' ? JSON.parse(news.tags).map((t: string) => (
                      <span key={t} className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs">#{t}</span>
                    )) : news.tags?.map((t: string) => (
                      <span key={t} className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs">#{t}</span>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
