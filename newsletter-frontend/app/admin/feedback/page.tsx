"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, RefreshCw, MessageSquareHeart } from "lucide-react";
import Link from "next/link";

import { FeedbackSection } from "../../../components/admin/FeedbackSection";
import { API_BASE_URL } from "../../../lib/api";

export default function AdminFeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [topRated, setTopRated] = useState<any[]>([]);
  const router = useRouter();

  const fetchData = useCallback(async (isRefresh = false) => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    if (isRefresh) setRefreshing(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/feedback/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setTopRated(data.topRated || []);
        setIsAuth(true);
      } else if (res.status === 401) {
        localStorage.removeItem("admin_token");
        router.push("/admin/login");
      } else {
        setErrorMsg("Erro ao carregar dados de feedback.");
      }
    } catch (err) {
      console.error("[AdminFeedback] Erro ao buscar dados:", err);
      setErrorMsg("Falha na conexão com o servidor.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] flex-col gap-4">
        <p className="text-red-400 font-medium">{errorMsg}</p>
        <Link href="/admin" className="px-4 py-2 bg-white/5 text-gray-300 rounded-lg text-sm">
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  if (!isAuth || !stats) return null;

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#0a0a0a] text-white">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* Topbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="text-gray-500 hover:text-white flex items-center gap-2 text-sm mb-2 transition-colors"
            >
              <LayoutDashboard size={16} /> Voltar ao Dashboard
            </Link>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-400 flex items-center gap-2">
              <MessageSquareHeart size={24} className="text-green-400" />
              Feedback dos Leitores
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Votos 👍 (Gostei) e 👎 (Não Gostei) registrados nas newsletters
            </p>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg border border-white/10 transition-all text-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>

        {/* Main content */}
        <FeedbackSection stats={stats} topRated={topRated} />

      </div>
    </main>
  );
}
