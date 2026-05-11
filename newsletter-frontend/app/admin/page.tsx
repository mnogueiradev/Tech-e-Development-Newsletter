"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Newspaper, CheckCircle, DatabaseZap, Activity, LogOut, RefreshCw } from "lucide-react";

import { StatCard } from "../../components/admin/DashboardCards";
import { RecentActivity } from "../../components/admin/RecentActivity";
import { TopNews } from "../../components/admin/TopNews";
import { OperationalStatus } from "../../components/admin/OperationalStatus";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://tech-e-development-newsletter.onrender.com";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const router = useRouter();

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    if (isRefresh) setRefreshing(true);

    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard`, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
        setIsAuth(true);
      } else if (res.status === 401) {
        localStorage.removeItem("admin_token");
        router.push("/admin/login");
      } else {
        setErrorMsg("Erro 500: O servidor não conseguiu gerar os dados do dashboard.");
      }
    } catch (err) {
      console.error("Erro ao buscar dados do dashboard", err);
      setErrorMsg("Falha na conexão com o servidor.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    fetchDashboardData();
    // Atualização automática leve a cada 1 minuto
    const interval = setInterval(() => fetchDashboardData(false), 60000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  function handleLogout() {
    localStorage.removeItem("admin_token");
    router.push("/admin/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 font-medium">Carregando painel...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] flex-col gap-4">
        <p className="text-red-400 font-medium">{errorMsg}</p>
        <button onClick={handleLogout} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg">Sair</button>
      </div>
    );
  }

  if (!isAuth || !dashboardData) return null;

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#0a0a0a] text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              Centro de Monitoramento
            </h1>
            <p className="text-green-400 text-sm mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              API: {dashboardData.systemStatus.api} • DB: {dashboardData.systemStatus.dbLatency}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg border border-white/10 transition-all disabled:opacity-50"
              title="Atualizar dados"
            >
              <RefreshCw size={18} className={refreshing ? "animate-spin text-purple-400" : ""} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-all font-medium text-sm"
            >
              <LogOut size={16} />
              <span className="hidden md:inline">Sair (Logout)</span>
            </button>
          </div>
        </div>

        {/* Section 1 & 2: Métricas Rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total de Inscritos" 
            value={dashboardData.metrics.totalSubscribers} 
            subtitle="Base ativa na plataforma"
            icon={Users} 
            status="neutral" 
          />
          <StatCard 
            title="Notícias Coletadas (Hoje)" 
            value={dashboardData.metrics.newsToday} 
            subtitle={`Ontem: ${dashboardData.metrics.newsYesterday}`}
            icon={Newspaper} 
            status="success" 
          />
          <StatCard 
            title="Notícias Selecionadas" 
            value={dashboardData.metrics.selectedNews} 
            subtitle="Aprovadas na curadoria"
            icon={CheckCircle} 
            status="warning" 
          />
          <StatCard 
            title="Fontes Monitoradas" 
            value={dashboardData.metrics.totalSources} 
            subtitle="Sites/Portais únicos"
            icon={DatabaseZap} 
            status="neutral" 
          />
        </div>

        {/* Sections 3, 4, 5 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <TopNews news={dashboardData.topNews} />
            <RecentActivity activities={dashboardData.recentActivity} />
          </div>
          <div className="space-y-6">
            <OperationalStatus status={dashboardData.operationalStatus} />
            
            {/* System Info Box */}
            <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl p-6">
               <div className="flex items-center gap-2 mb-4">
                 <Activity className="text-purple-400" size={20} />
                 <h3 className="text-lg font-bold text-white">Últimas Ações</h3>
               </div>
               <ul className="space-y-3 text-sm text-gray-400">
                 <li className="flex justify-between">
                   <span>Coleta Automática:</span>
                   <strong className="text-white">{dashboardData.systemStatus.lastCollection}</strong>
                 </li>
                 <li className="flex justify-between">
                   <span>Envio Newsletter:</span>
                   <strong className="text-white">{dashboardData.systemStatus.lastNewsletter}</strong>
                 </li>
               </ul>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
