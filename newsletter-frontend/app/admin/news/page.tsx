"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, LayoutDashboard, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { NewsFilters } from "../../../components/admin/news/NewsFilters";
import { NewsTable } from "../../../components/admin/news/NewsTable";
import { NewsDetailsModal } from "../../../components/admin/news/NewsDetailsModal";
import { API_BASE_URL } from "../../../lib/api";

export default function AdminNewsCMS() {
  const [loading, setLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);
  const [newsList, setNewsList] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [filterOptions, setFilterOptions] = useState({ sources: [], categories: [] });
  const [selectedNewsId, setSelectedNewsId] = useState<number | null>(null);
  
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    category: '',
    source_id: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    page: 1
  });

  const router = useRouter();

  const fetchFilters = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/news/filters`, { headers: { "Authorization": `Bearer ${token}` } });
      if (res.ok) setFilterOptions(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchNews = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.push("/admin/login");
      return;
    }
    
    setLoading(true);
    try {
      const params = new URLSearchParams(filters as any).toString();
      const res = await fetch(`${API_BASE_URL}/api/admin/news?${params}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setNewsList(data.data);
        setPagination(data.pagination);
        setIsAuth(true);
      } else if (res.status === 401) {
        localStorage.removeItem("admin_token");
        router.push("/admin/login");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, router]);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) fetchFilters(token);
    fetchNews();
  }, [fetchNews]);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      const token = localStorage.getItem("admin_token");
      await fetch(`${API_BASE_URL}/api/admin/news/${id}/status`, {
        method: 'PATCH',
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      // Update local state without full refetch
      setNewsList(newsList.map((n: any) => n.id === id ? { ...n, status } : n));
    } catch (err) {
      console.error(err);
      alert("Erro ao alterar status");
    }
  };

  const handleCollectNews = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      alert("A coleta de notícias foi iniciada em segundo plano. Este processo pode levar alguns minutos. Recarregue a página em breve para ver as novas notícias.");
      await fetch(`${API_BASE_URL}/api/admin/news/collect`, {
        method: 'POST',
        headers: { "Authorization": `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
      alert("Erro ao iniciar a coleta.");
    }
  };

  if (!isAuth && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#0a0a0a] text-white">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Topbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="text-gray-500 hover:text-white flex items-center gap-2 text-sm mb-2 transition-colors">
              <LayoutDashboard size={16} /> Voltar ao Dashboard
            </Link>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400">
              CMS Editorial
            </h1>
            <p className="text-gray-400 text-sm">{pagination.total} notícias cadastradas</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleCollectNews} 
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg border border-purple-500 transition-all text-sm font-medium shadow-lg shadow-purple-500/20"
            >
              Forçar Coleta
            </button>
            <button 
              onClick={() => fetchNews()} 
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg border border-white/10 transition-all text-sm"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar
            </button>
          </div>
        </div>

        {/* Filters */}
        <NewsFilters filters={filters} setFilters={setFilters} options={filterOptions} />

        {/* Loading / List */}
        {loading ? (
          <div className="py-20 flex justify-center"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <>
            <NewsTable 
              news={newsList} 
              onAction={handleStatusChange} 
              onViewDetails={(item) => setSelectedNewsId(item.id)} 
            />

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between bg-white/5 border border-white/10 px-4 py-3 rounded-xl">
                <span className="text-sm text-gray-400">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button 
                    disabled={pagination.page <= 1}
                    onClick={() => setFilters({...filters, page: filters.page - 1})}
                    className="p-2 bg-black/20 hover:bg-black/40 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button 
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setFilters({...filters, page: filters.page + 1})}
                    className="p-2 bg-black/20 hover:bg-black/40 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* Details Modal */}
      <NewsDetailsModal 
        newsId={selectedNewsId} 
        onClose={() => setSelectedNewsId(null)} 
        onStatusChange={(id, status) => {
          handleStatusChange(id, status);
        }}
      />
    </main>
  );
}
