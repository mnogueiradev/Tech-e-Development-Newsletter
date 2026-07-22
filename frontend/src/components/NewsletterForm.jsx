import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      await api.post('/subscribe', { email });
      toast.success('Inscrição confirmada com sucesso!');
      setEmail('');
    } catch (error) {
      toast.error(
        error.response?.data?.error || error.response?.data?.message || 'Ocorreu um erro ao assinar. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mt-6 flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <label htmlFor="email-address" className="sr-only">Endereço de e-mail</label>
        <input
          type="email"
          id="email-address"
          name="email"
          autoComplete="email"
          required
          className="block w-full px-4 py-3 border border-brand-border rounded text-brand-dark bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent text-base transition-shadow"
          placeholder="Seu melhor e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full sm:w-auto flex items-center justify-center px-6 py-3 border border-transparent text-base font-semibold rounded text-[#0F1115] bg-brand-accent hover:bg-brand-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-accent focus:ring-offset-[#0F1115] disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Inscrevendo...' : 'Receber gratuitamente'}
      </button>
      <div aria-live="polite" className="sr-only">
        {loading ? 'Enviando...' : ''}
      </div>
    </form>
  );
}
