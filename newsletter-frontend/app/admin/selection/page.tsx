"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Wand2, Save, Trash2, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableNewsItem } from "../../../components/admin/selection/SortableNewsItem";
import { API_BASE_URL } from "../../../lib/api";

export default function AdminSelection() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [selection, setSelection] = useState<any[]>([]);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.push("/admin/login");
    } else {
      setIsAuth(true);
    }
  }, [router]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        alert("Token não encontrado. Por favor, faça login novamente.");
        router.push("/admin/login");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/admin/selection/generate`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorData = await res.json();
        const errorMsg = errorData.message || errorData.details || errorData.error;
        alert(`Erro ao gerar seleção: ${errorMsg}`);
        console.error("Erro na resposta:", errorData);
        return;
      }

      const data = await res.json();
      
      // Validar se suggestions existe e é um array
      if (!data.suggestions || !Array.isArray(data.suggestions)) {
        alert("Erro: Resposta inválida do servidor. Verifique o console.");
        console.error("Dados inválidos recebidos:", data);
        return;
      }

      if (data.suggestions.length === 0) {
        alert("Nenhuma notícia disponível para sugerir. Clique em 'Coletar Notícias' primeiro.");
        return;
      }

      // Garantir que cada item tem um ID string para o dnd-kit
      const validatedSelection = data.suggestions.map((item: any) => {
        if (!item.id) {
          console.warn("Item sem ID detectado:", item);
          return null;
        }
        return { 
          ...item, 
          dndId: String(item.id),
          score: item.score || 0,
          source_name: item.source_name || 'Fonte Desconhecida',
          selectionReason: item.selectionReason || 'Sugerida pelo algoritmo'
        };
      }).filter(Boolean); // Remove null entries

      if (validatedSelection.length === 0) {
        alert("Nenhuma notícia válida foi retornada.");
        return;
      }

      setSelection(validatedSelection);
      console.log(`✅ ${validatedSelection.length} notícias carregadas com sucesso`);
    } catch (err) {
      console.error("Erro ao gerar seleção:", err);
      alert("Falha na conexão ao gerar seleção. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (selection.length === 0) {
      alert("A seleção está vazia! Clique em 'Sugerir Edição' primeiro.");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        alert("Token não encontrado. Por favor, faça login novamente.");
        router.push("/admin/login");
        return;
      }

      // Preparar dados para envio, removendo o dndId (é apenas para o componente)
      const dataToSend = selection.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        source_name: item.source_name,
        original_link: item.original_link,
        score: item.score,
        category: item.category,
        selectionReason: item.selectionReason,
        main_image: item.main_image,
        publication_date: item.publication_date
      }));

      const res = await fetch(`${API_BASE_URL}/api/admin/selection/save`, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ selection: dataToSend })
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(`Erro ao salvar: ${errorData.error || errorData.details || "Erro desconhecido"}`);
        console.error("Erro na resposta:", errorData);
        return;
      }

      const data = await res.json();
      alert(`✅ ${data.count || selection.length} notícias salvas com sucesso!`);
      console.log("Edição salva com sucesso:", data);
    } catch (err) {
      console.error("Erro ao salvar seleção:", err);
      alert("Falha ao salvar a edição. Verifique sua conexão e tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSelection((items) => {
        const oldIndex = items.findIndex(item => item.dndId === active.id);
        const newIndex = items.findIndex(item => item.dndId === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeNews = (idToRemove: string) => {
    setSelection(selection.filter(item => item.dndId !== idToRemove));
  };

  if (!isAuth) return null;

  const avgScore = selection.length > 0 
    ? Math.round(selection.reduce((acc, curr) => acc + curr.score, 0) / selection.length)
    : 0;

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#0a0a0a] text-white">
      <div className="max-w-[1200px] mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 p-6 rounded-2xl border border-white/10">
          <div>
            <Link href="/admin" className="text-gray-500 hover:text-white flex items-center gap-2 text-sm mb-2 transition-colors">
              <LayoutDashboard size={16} /> Voltar ao Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-white">Montagem da Edição</h1>
            <p className="text-gray-400 text-sm mt-1">Data: {new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => setSelection([])}
              className="flex items-center gap-2 px-4 py-2 bg-black/20 hover:bg-black/40 text-gray-400 rounded-lg border border-white/10 transition-colors text-sm"
            >
              <Trash2 size={16} /> Limpar
            </button>
            <button 
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-lg border border-blue-500/20 transition-all text-sm disabled:opacity-50"
            >
              <Wand2 size={16} className={loading ? "animate-pulse" : ""} /> 
              {loading ? "Gerando..." : "Sugerir Edição"}
            </button>
            <button 
              onClick={handleSave}
              disabled={saving || selection.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={16} className={saving ? "animate-spin" : ""} /> 
              {saving ? "Salvando..." : "Salvar Edição"}
            </button>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <p className="text-gray-400 text-xs uppercase font-bold mb-1">Selecionadas</p>
            <p className="text-2xl font-bold">{selection.length}</p>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <p className="text-gray-400 text-xs uppercase font-bold mb-1">Score Médio</p>
            <p className={`text-2xl font-bold ${avgScore > 60 ? 'text-green-400' : 'text-yellow-400'}`}>{avgScore}</p>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl md:col-span-2 flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs uppercase font-bold mb-1">Dica Editorial</p>
              <p className="text-sm text-gray-300">Arraste para reordenar. O 1º item será a Manchete (Headline).</p>
            </div>
            <LayoutTemplate className="text-gray-500 opacity-50" size={32} />
          </div>
        </div>

        {/* List / Engine */}
        <div className="bg-black/20 border border-white/10 rounded-2xl p-6 min-h-[400px]">
          {selection.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 opacity-50">
              <Wand2 size={48} className="mb-4 text-gray-500" />
              <p className="text-lg font-medium text-gray-400">Nenhuma notícia na edição atual</p>
              <p className="text-sm text-gray-500 mt-2">Clique em "Sugerir Edição" para que o algoritmo monte uma sugestão balanceada.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={selection.map(s => s.dndId)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {selection.map((item, index) => (
                    <SortableNewsItem 
                      key={item.dndId} 
                      id={item.dndId} 
                      item={item} 
                      index={index}
                      onRemove={removeNews} 
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

      </div>
    </main>
  );
}
