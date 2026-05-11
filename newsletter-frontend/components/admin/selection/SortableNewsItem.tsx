import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, ExternalLink } from 'lucide-react';

interface Props {
  id: string;
  item: any;
  onRemove: (id: string) => void;
  index: number;
}

export function SortableNewsItem({ id, item, onRemove, index }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 items-center group transition-colors ${
        isDragging ? 'opacity-50 ring-2 ring-purple-500' : 'hover:bg-white/10'
      }`}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="cursor-grab active:cursor-grabbing p-1 text-gray-500 hover:text-white"
      >
        <GripVertical size={20} />
      </div>
      
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 font-bold text-sm border border-purple-500/20">
        #{index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-white text-sm font-medium line-clamp-2 leading-tight">
          {item.title}
        </h4>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
          <span className="bg-white/10 px-2 py-0.5 rounded text-gray-300">{item.source_name || 'Desconhecida'}</span>
          <span>Score: <strong className={item.score > 70 ? 'text-green-400' : 'text-yellow-400'}>{item.score}</strong></span>
          <span className="text-purple-400 truncate max-w-[200px]">{item.selectionReason || 'Selecionada manualmente'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <a href={item.original_link} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-blue-400 transition-colors">
          <ExternalLink size={18} />
        </a>
        <button onClick={() => onRemove(id)} className="p-2 text-gray-400 hover:text-red-400 transition-colors">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
