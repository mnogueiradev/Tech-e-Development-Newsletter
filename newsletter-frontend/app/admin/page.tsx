"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://tech-e-development-newsletter.onrender.com";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("admin_token");
      
      if (!token) {
        router.push("/admin/login");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/auth/verify`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (res.ok) {
          setIsAuth(true);
        } else {
          // Token inválido ou expirado
          localStorage.removeItem("admin_token");
          router.push("/admin/login");
        }
      } catch (err) {
        console.error("Erro ao validar sessão", err);
        router.push("/admin/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("admin_token");
    router.push("/admin/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <p className="text-white">Verificando sessão...</p>
      </div>
    );
  }

  if (!isAuth) return null;

  return (
    <main className="min-h-screen p-8 bg-[#0a0a0a] text-white">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between bg-white/5 p-6 rounded-2xl border border-white/10">
          <div>
            <h1 className="text-2xl font-bold">Painel Administrativo</h1>
            <p className="text-green-400 text-sm mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              Sessão Autenticada e Segura
            </p>
          </div>
          
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-all font-medium"
          >
            Sair (Logout)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
            <h3 className="text-gray-400 text-sm font-medium">Status do Sistema</h3>
            <p className="text-2xl font-semibold mt-2">Online</p>
          </div>
          {/* Espaço para futuros cards como quantidade de inscritos, disparo manual, etc */}
        </div>
      </div>
    </main>
  );
}
