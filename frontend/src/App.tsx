import { useState } from 'react';

function App() {
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | null }>({ message: '', type: null });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ message: '', type: null });

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      // Como o React roda na porta 5173 e o Node na 3000, 
      // precisaremos garantir que a URL absoluta seja usada, ou configurar um proxy no Vite.
      // Para já, vamos usar a URL absoluta se rodando localmente (assumindo localhost:3000)
      const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

      const response = await fetch(`${baseUrl}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, timezone: userTimezone, topic })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus({ message: 'Inscrição realizada com sucesso! 🎉', type: 'success' });
        setEmail('');
        setTopic('');
      } else {
        setStatus({ message: data.error || 'Erro ao realizar inscrição.', type: 'error' });
      }
    } catch (err) {
      setStatus({ message: 'Erro de conexão com o servidor.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Background Shapes */}
      <div className="absolute w-[400px] h-[400px] bg-blue-500/30 rounded-full blur-[80px] -top-[100px] -left-[100px] animate-float -z-10"></div>
      <div className="absolute w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[80px] -bottom-[200px] -right-[100px] animate-float-delayed -z-10"></div>

      {/* Main Container */}
      <div className="bg-slate-800/70 backdrop-blur-md border border-white/10 rounded-3xl p-8 sm:p-12 w-full max-w-md text-center shadow-2xl relative z-10 animate-slide-up">

        <img
          src="/Icon_News.png"
          alt="Logo"
          className="w-20 h-20 mx-auto mb-6 rounded-2xl shadow-lg object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null; // Previne o loop infinito de carregamento
            target.src = 'https://via.placeholder.com/80/3b82f6/ffffff?text=TN';
          }}
        />

        <h1 className="font-extrabold text-3xl sm:text-4xl mb-2 bg-gradient-to-br from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Tech &amp; Development Newsletter
        </h1>

        <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-8">
          Receba diariamente 9 notícias curadas diretamente no seu email. As melhores fontes do Brasil.
        </p>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <select
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full p-4 rounded-xl border border-white/10 bg-slate-900/60 text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all cursor-pointer"
          >
            <option value="" disabled>Escolha o seu nicho preferido...</option>
            <option value="tecnologia" className="bg-slate-900 text-white">👨‍💻 Tecnologia (Programação, IA, Hardware)</option>
            <option value="financas" className="bg-slate-900 text-white">📈 Finanças (Mercado Financeiro, Economia)</option>
          </select>

          <input
            type="email"
            placeholder="Seu melhor email..."
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 rounded-xl border border-white/10 bg-slate-900/60 text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full p-4 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-white font-semibold text-lg hover:-translate-y-1 hover:shadow-[0_15px_25px_-10px_rgba(59,130,246,0.6)] active:translate-y-0 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Inscrevendo...' : 'Inscrever-se gratuitamente'}
          </button>
        </form>

        {/* Mensagem de Status */}
        {status.message && (
          <div className={`mt-4 text-sm font-medium h-5 ${status.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
