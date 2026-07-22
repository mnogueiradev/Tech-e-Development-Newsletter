import NewsletterForm from './NewsletterForm';
import { Clock } from 'lucide-react';

export default function Hero() {
  return (
    <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
        {/* Left Column - Text and Form */}
        <div className="flex-1 text-left">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6 font-heading">
            As 9 notícias de tecnologia que realmente importam.
          </h1>
          
          <p className="mt-4 text-lg sm:text-xl text-brand-muted max-w-2xl mb-8">
            Receba em 5 minutos o que desenvolvedores, profissionais de IA e líderes de tecnologia precisam saber antes do mercado abrir.
          </p>

          <NewsletterForm />

          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-brand-muted">
            <span>Enviada de segunda a sexta.</span>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-brand-border"></span>
            <span>Sem spam.</span>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-brand-border"></span>
            <span>Cancele quando quiser.</span>
          </div>
        </div>

        {/* Right Column - Mockup Edition */}
        <div className="w-full max-w-md lg:w-5/12 hidden md:block">
          <div className="editorial-card rounded-lg p-8 shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-accent rounded-t-lg"></div>
            
            <header className="mb-6 border-b border-brand-border pb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-brand-muted uppercase tracking-widest">A Edição de Hoje</span>
                <span className="text-xs text-brand-muted">08:00 AM</span>
              </div>
              <h3 className="font-heading font-bold text-2xl text-white">Top 9 de Tecnologia</h3>
            </header>

            <div className="space-y-6">
              {/* Mock Article 1 */}
              <article>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">Inteligência Artificial</span>
                  <span className="text-brand-muted text-xs flex items-center gap-1"><Clock className="w-3 h-3"/> 2 min</span>
                </div>
                <h4 className="font-heading font-semibold text-white text-lg leading-tight mb-1">
                  Novo modelo open-source supera GPT-4 em testes de raciocínio lógico
                </h4>
                <p className="text-sm text-brand-muted line-clamp-2">Pesquisadores lançaram hoje um modelo com 7B parâmetros que promete rodar localmente com performance inédita.</p>
              </article>

              {/* Mock Article 2 */}
              <article>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">Cloud & Infra</span>
                  <span className="text-brand-muted text-xs flex items-center gap-1"><Clock className="w-3 h-3"/> 1 min</span>
                </div>
                <h4 className="font-heading font-semibold text-white text-lg leading-tight mb-1">
                  A grande mudança de arquitetura do servidor Kubernetes
                </h4>
              </article>

              {/* Mock Article 3 */}
              <article>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">Desenvolvimento</span>
                  <span className="text-brand-muted text-xs flex items-center gap-1"><Clock className="w-3 h-3"/> 3 min</span>
                </div>
                <h4 className="font-heading font-semibold text-white text-lg leading-tight mb-1">
                  React 19 lança recursos muito aguardados para compilação otimizada
                </h4>
              </article>
            </div>
            
            <div className="mt-6 pt-4 border-t border-brand-border text-center">
              <span className="text-xs text-brand-muted italic">E mais 6 histórias completas na edição...</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
