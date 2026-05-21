import { Search, Filter, SortDesc } from "lucide-react";

interface FilterProps {
  filters: any;
  setFilters: (f: any) => void;
  options: { sources: {id: number, name: string}[], categories: string[] };
}

export function NewsFilters({ filters, setFilters, options }: FilterProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value, page: 1 });
  };

  return (
    <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-wrap gap-4 items-center">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input 
          type="text" 
          name="search"
          placeholder="Buscar notícias..." 
          value={filters.search}
          onChange={handleChange}
          className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
        />
      </div>

      <div className="flex gap-4 flex-wrap">
        <select name="status" value={filters.status} onChange={handleChange} className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
          <option value="">Status: Todos</option>
          <option value="coletada">Coletada / Pendente</option>
          <option value="aprovada">Aprovada</option>
          <option value="destacada">Destacada</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="arquivada">Arquivada</option>
        </select>

        <select name="category" value={filters.category} onChange={handleChange} className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
          <option value="">Categoria: Todas</option>
          {options.categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select name="source_id" value={filters.source_id} onChange={handleChange} className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
          <option value="">Fonte: Todas</option>
          {options.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select name="sortBy" value={filters.sortBy} onChange={handleChange} className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
          <option value="created_at">Data da Coleta</option>
          <option value="score">Score de Relevância</option>
          <option value="title">Título (A-Z)</option>
        </select>
        
        <select name="sortOrder" value={filters.sortOrder} onChange={handleChange} className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
          <option value="desc">Descrescente</option>
          <option value="asc">Crescente</option>
        </select>
      </div>
    </div>
  );
}
