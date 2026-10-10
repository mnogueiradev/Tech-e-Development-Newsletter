import { Sparkles } from 'lucide-react';

export default function EditorialLens({ editorialLabel, whyItMatters, nextStep }) {
  if (!whyItMatters && !nextStep) return null;

  return (
    <aside className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-[#121826] to-purple-900/10 p-4 md:p-5">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-cyan-300 to-purple-400" aria-hidden="true" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Lente Techndevn
        </span>
        {editorialLabel && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-gray-300">
            {editorialLabel}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {whyItMatters && (
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Por que importa</p>
            <p className="text-sm leading-relaxed text-gray-200">{whyItMatters}</p>
          </div>
        )}
        {nextStep && (
          <div className="border-t border-white/10 pt-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Próximo passo</p>
            <p className="text-sm leading-relaxed text-gray-200">{nextStep}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
