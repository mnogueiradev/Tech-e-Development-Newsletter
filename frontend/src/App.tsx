import React, { useState } from 'react';

function App() {
  const [email, setEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setStatusMessage('Email inválido.');
      setStatusType('error');
      return;
    }

    setIsLoading(true);
    setStatusMessage('');

    try {
      const response = await fetch('/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMessage('Inscrição realizada com sucesso! 🎉');
        setStatusType('success');
        setEmail('');
      } else {
        setStatusMessage(data.error || 'Erro ao realizar inscrição.');
        setStatusType('error');
      }
    } catch (err) {
      setStatusMessage('Erro de conexão com o servidor.');
      setStatusType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <div className="min-h-screen backdrop-blur-3xl bg-white/5">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="mb-6">
                <img 
                  src="/image.png" 
                  alt="Tech & Development Newsletter" 
                  className="w-24 h-24 mx-auto object-contain"
                />
              </div>
              <h1 className="text-4xl font-bold text-white mb-4">
                Tech & Development Newsletter
              </h1>
              <p className="text-gray-300 text-lg">
                Receba diariamente 9 notícias de tecnologia curadas diretamente no seu email.
              </p>
            </div>

            {/* Form */}
            <div className="backdrop-blur-lg bg-white/10 rounded-2xl p-8 shadow-2xl border border-white/20">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Seu melhor email"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent backdrop-blur-sm"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-violet-600 text-white font-semibold rounded-lg shadow-lg hover:from-purple-700 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isLoading ? 'Inscrevendo...' : 'Inscrever-se gratuitamente'}
                </button>
              </form>

              {statusMessage && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${
                  statusType === 'success' 
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  {statusMessage}
                </div>
              )}
            </div>

            {/* Preview Section */}
            <div className="mt-12 text-center">
              <h2 className="text-2xl font-semibold text-white mb-6">
                Veja como sua newsletter chegará
              </h2>
              <div className="space-y-4">
                <img 
                  src="/screenshot3.png" 
                  alt="Exemplo de newsletter 1"
                  className="w-full rounded-lg shadow-xl border border-white/10"
                />
                <img 
                  src="/screenshot1.png" 
                  alt="Exemplo de newsletter 2"
                  className="w-full rounded-lg shadow-xl border border-white/10"
                />
                <img 
                  src="/screenshot2.png" 
                  alt="Exemplo de newsletter 3"
                  className="w-full rounded-lg shadow-xl border border-white/10"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
