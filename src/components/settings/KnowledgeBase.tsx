import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Search, Trash2, RefreshCw, FileText, Upload, Check, X, AlertTriangle, Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface KnowledgeSource {
  id: string;
  title: string;
  category: string;
  type: 'text' | 'file';
  status: 'draft' | 'published';
  raw_text: string | null;
  file_path: string | null;
  indexed_at: string | null;
  last_index_error: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['geral', 'serviços', 'processos', 'comercial', 'FAQ', 'institucional'];

export default function KnowledgeBase() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [indexingId, setIndexingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    title: '',
    category: 'geral',
    type: 'text' as 'text' | 'file',
    status: 'draft' as 'draft' | 'published',
    raw_text: '',
  });
  const [file, setFile] = useState<File | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('knowledge_sources')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSources((data || []) as unknown as KnowledgeSource[]);
    } catch (err: any) {
      console.error('[KB] Fetch error:', err);
      toast.error('Erro ao carregar base de conhecimento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', category: 'geral', type: 'text', status: 'draft', raw_text: '' });
    setFile(null);
    setModalOpen(true);
  };

  const openEdit = (src: KnowledgeSource) => {
    setEditing(src);
    setForm({
      title: src.title,
      category: src.category,
      type: src.type,
      status: src.status,
      raw_text: src.raw_text || '',
    });
    setFile(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Título obrigatório'); return; }
    if (form.type === 'text' && !form.raw_text.trim()) { toast.error('Conteúdo obrigatório'); return; }
    if (form.type === 'file' && !file && !editing?.file_path) { toast.error('Arquivo obrigatório'); return; }

    setSaving(true);
    try {
      let filePath = editing?.file_path || null;

      // Upload file if provided
      if (form.type === 'file' && file) {
        const ext = file.name.split('.').pop();
        const path = `kb/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('knowledge-files').upload(path, file);
        if (upErr) throw upErr;
        filePath = path;
      }

      const payload: any = {
        title: form.title.trim(),
        category: form.category,
        type: form.type,
        status: form.status,
        raw_text: form.type === 'text' ? form.raw_text : null,
        file_path: form.type === 'file' ? filePath : null,
      };

      if (editing) {
        const { error } = await supabase.from('knowledge_sources').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Conteúdo atualizado');
      } else {
        const { data: userData } = await supabase.auth.getUser();
        payload.created_by = userData?.user?.id || null;
        const { error } = await supabase.from('knowledge_sources').insert(payload);
        if (error) throw error;
        toast.success('Conteúdo criado');
      }

      setModalOpen(false);
      await fetchSources();

      // Auto-index if published
      if (form.status === 'published') {
        const src = editing || sources.find(s => s.title === form.title.trim());
        if (src) triggerIndex(src.id);
        else {
          // Re-fetch to get the new id
          const { data: newData } = await supabase.from('knowledge_sources').select('id').eq('title', form.title.trim()).order('created_at', { ascending: false }).limit(1).single();
          if (newData) triggerIndex(newData.id);
        }
      }
    } catch (err: any) {
      console.error('[KB] Save error:', err);
      toast.error('Erro ao salvar: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const triggerIndex = async (sourceId: string) => {
    setIndexingId(sourceId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('knowledge-index', {
        body: { source_id: sourceId },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.error) throw res.error;
      toast.success('Indexação concluída');
      await fetchSources();
    } catch (err: any) {
      console.error('[KB] Index error:', err);
      toast.error('Erro ao indexar: ' + (err.message || ''));
      await fetchSources();
    } finally {
      setIndexingId(null);
    }
  };

  const handleDelete = async (src: KnowledgeSource) => {
    if (!confirm(`Excluir "${src.title}"?`)) return;
    try {
      if (src.file_path) {
        await supabase.storage.from('knowledge-files').remove([src.file_path]);
      }
      const { error } = await supabase.from('knowledge_sources').delete().eq('id', src.id);
      if (error) throw error;
      toast.success('Excluído');
      await fetchSources();
    } catch (err: any) {
      toast.error('Erro ao excluir');
    }
  };

  const togglePublish = async (src: KnowledgeSource) => {
    const newStatus = src.status === 'published' ? 'draft' : 'published';
    try {
      const { error } = await supabase.from('knowledge_sources').update({ status: newStatus }).eq('id', src.id);
      if (error) throw error;
      if (newStatus === 'published') triggerIndex(src.id);
      else await fetchSources();
      toast.success(newStatus === 'published' ? 'Publicado' : 'Despublicado');
    } catch { toast.error('Erro ao alterar status'); }
  };

  const filtered = sources.filter(s => {
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) && !s.category.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && s.category !== filterCategory) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  const getStatusBadge = (src: KnowledgeSource) => {
    if (src.status === 'draft') return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Rascunho</span>;
    if (src.last_index_error) return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400"><X className="w-3 h-3" /> Erro</span>;
    if (src.indexed_at) return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400"><Check className="w-3 h-3" /> Indexado</span>;
    return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400"><AlertTriangle className="w-3 h-3" /> Pendente</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold text-white">Base de Conhecimento</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {sources.filter(s => s.status === 'published').length} publicados
          </span>
        </div>
        <Button onClick={openCreate} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar conteúdo
        </Button>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Adicione informações da empresa que a IA usará para responder perguntas fora do fluxo principal.
      </p>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="h-8 px-2 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-300"
        >
          <option value="">Todas categorias</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="h-8 px-2 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-300"
        >
          <option value="">Todos status</option>
          <option value="draft">Rascunho</option>
          <option value="published">Publicado</option>
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          {sources.length === 0 ? 'Nenhum conteúdo adicionado ainda.' : 'Nenhum resultado com os filtros aplicados.'}
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
          {filtered.map(src => (
            <div key={src.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {src.type === 'text' ? (
                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                ) : (
                  <Upload className="w-4 h-4 text-violet-400 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium truncate">{src.title}</span>
                    {getStatusBadge(src)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-500">{src.category}</span>
                    {src.last_index_error && (
                      <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={src.last_index_error}>
                        {src.last_index_error}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => togglePublish(src)}
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  title={src.status === 'published' ? 'Despublicar' : 'Publicar'}
                >
                  {src.status === 'published' ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => triggerIndex(src.id)}
                  disabled={indexingId === src.id}
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                  title="Reindexar"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${indexingId === src.id ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => openEdit(src)}
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  title="Editar"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(src)}
                  className="p-1.5 rounded-md hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Conteúdo' : 'Adicionar Conteúdo'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Título</label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: História da Empresa"
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Categoria</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-300"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Tipo</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as 'text' | 'file' })}
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-300"
                  disabled={!!editing}
                >
                  <option value="text">Texto</option>
                  <option value="file">Arquivo (PDF/TXT)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Status</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setForm({ ...form, status: 'draft' })}
                  className={`flex-1 h-9 text-xs font-medium rounded-lg transition-all ${form.status === 'draft' ? 'bg-slate-700 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'}`}
                >
                  Rascunho
                </button>
                <button
                  onClick={() => setForm({ ...form, status: 'published' })}
                  className={`flex-1 h-9 text-xs font-medium rounded-lg transition-all ${form.status === 'published' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'}`}
                >
                  Publicado
                </button>
              </div>
            </div>

            {form.type === 'text' ? (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Conteúdo</label>
                <textarea
                  value={form.raw_text}
                  onChange={e => setForm({ ...form, raw_text: e.target.value })}
                  placeholder="Cole aqui as informações sobre a empresa, serviços, processos..."
                  rows={8}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y font-mono"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Arquivo</label>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.docx"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                />
                {editing?.file_path && !file && (
                  <p className="text-[10px] text-slate-500 mt-1">Arquivo atual: {editing.file_path.split('/').pop()}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
