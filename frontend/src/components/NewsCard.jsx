import { Clock } from 'lucide-react';

export default function NewsCard({ item }) {
  return (
    <article className="editorial-card rounded-md p-6 group flex flex-col h-full">
      <a 
        href={item.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex flex-col h-full outline-none focus-visible:ring-2 focus-visible:ring-brand-accent rounded"
      >
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-accent">
              {item.category}
            </span>
            <span className="text-brand-muted text-xs flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {item.readingTime}
            </span>
          </div>
        </div>
        
        <h3 className="text-xl font-heading font-bold text-white mb-2 leading-snug group-hover:text-brand-accent transition-colors">
          {item.title}
        </h3>
        
        <p className="text-sm text-brand-muted flex-grow mb-4 leading-relaxed">
          {item.summary}
        </p>

        <div className="mt-auto pt-4 border-t border-brand-border flex items-center gap-2 text-xs text-brand-muted">
          {item.score && (
            <>
              <span className="font-semibold text-white">Score editorial: {item.score}</span>
              <span>•</span>
            </>
          )}
          <span>Tech & Dev</span>
        </div>
      </a>
    </article>
  );
}
