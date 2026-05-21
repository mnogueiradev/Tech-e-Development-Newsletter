"use client";

import { useState, FormEvent } from "react";

// URL do backend no Render
const API_URL = "https://tech-e-development-newsletter.onrender.com/subscribe";

export default function Home() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Validação simples de email
  function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // Validação frontend
    if (!email.trim()) {
      setError("Por favor, insira seu email.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Email inválido. Verifique o formato.");
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Backend retorna { error: "..." }
        setError(data.error || "Erro ao cadastrar email.");
        return;
      }

      // Sucesso
      setSuccess(true);
      setEmail("");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
            Receba as principais notícias de <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">tecnologia</span> todos os dias
          </h1>
          <p className="text-gray-300 text-lg">
            Fique por dentro das últimas novidades com nossa newsletter diária
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              disabled={loading}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:opacity-50"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg shadow-lg hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-transparent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                Inscrevendo...
              </span>
            ) : (
              "Inscrever-se"
            )}
          </button>
        </form>

        {/* Feedback visual */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-300 text-center">{error}</p>
          </div>
        )}
        
        {success && (
          <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
            <p className="text-green-300 text-center">
              Inscrição realizada com sucesso! Verifique seu email 🎉
            </p>
          </div>
        )}

        {/* Footer info */}
        <div className="text-center text-gray-400 text-sm">
          <p>Grátis • Sem spam • Cancelar quando quiser</p>
        </div>
      </div>
    </main>
  );
}
