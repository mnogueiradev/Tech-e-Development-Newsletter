"use client";

import { useState, FormEvent } from "react";

// URL do backend (altere para a URL do Render em produção)
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/subscribe";

export default function SubscribeForm() {
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
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError("");
          }}
          disabled={loading}
          className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
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
              Enviando...
            </span>
          ) : (
            "Inscrever-se"
          )}
        </button>
      </div>

      {/* Feedback visual */}
      {error && (
        <p className="text-red-400 text-sm text-center">{error}</p>
      )}
      {success && (
        <p className="text-green-400 text-sm text-center">
          Inscrição realizada com sucesso! 🎉
        </p>
      )}
    </form>
  );
}
