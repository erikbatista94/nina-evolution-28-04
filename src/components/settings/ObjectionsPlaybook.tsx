import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Edit2, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '../Button';

interface Objection {
  id: string;
  title: string;
  category: string;
  triggers: string[];
  response_text: string;
  is_active: boolean;
}

const CATEGORIES = ['preco', 'prazo', 'concorrente', 'indecisao', 'sem_projeto', 'urgencia', 'geral'];

const ObjectionsPlaybook: React.FC = () => {
  const [objections, setObjections] = useState<Objection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', category: 'geral', triggers: '', response_text: '' });

  useEffect(() => { loadObjections(); }, []);

  const loadObjections = async () => {
    const { data } = await supabase.from('objections_playbook').select('*').order('category');
    setObjections((data as any[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.response_text.trim()) {
      toast.error('Preencha título e resposta');
      return;
    }
    const triggers = form.triggers.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    
    if (editingId) {
      await supabase.from('objections_playbook').update({
        title: form.title, category: form.category, triggers, response_text: form.response_text,
      }).eq('id', editingId);
      toast.success('Objeção atualizada');
    } else {
      await supabase.from('objections_playbook').insert({
        title: form.title, category: form.category, triggers, response_text: form.response_text,
      });
      toast.success('Objeção criada');
    }
    setForm({ title: '', category: 'geral', triggers: '', response_text: '' });
    setShowForm(false);
    setEditingId(null);
    loadObjections();
  };

  const handleEdit = (obj: Objection) => {
    setForm({ title: obj.title, category: obj.category, triggers: obj.triggers.join(', '), response_text: obj.response_text });
    setEditingId(obj.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('objections_playbook').delete().eq('id', id);
    toast.success('Objeção removida');
    loadObjections();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Playbook de Objeções</h3>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ title: '', category: 'geral', triggers: '', response_text: '' }); }}>
          <Plus className="w-4 h-4 mr-1" /> Nova Objeção
        </Button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/50 space-y-3">
          <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Título (ex: Cliente acha caro)" className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200" />
          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.triggers} onChange={e => setForm({...form, triggers: e.target.value})} placeholder="Gatilhos (separados por vírgula): caro, preço alto, muito" className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200" />
          <textarea value={form.response_text} onChange={e => setForm({...form, response_text: e.target.value})} placeholder="Resposta sugerida" rows={3} className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 resize-y" />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}><Check className="w-4 h-4 mr-1" /> Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}><X className="w-4 h-4 mr-1" /> Cancelar</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {objections.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">Nenhuma objeção cadastrada ainda.</p>
        ) : objections.map(obj => (
          <div key={obj.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/30 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white">{obj.title}</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 text-slate-400">{obj.category}</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-1">
                {obj.triggers.map((t, i) => (
                  <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{t}</span>
                ))}
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">{obj.response_text}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => handleEdit(obj)} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(obj.id)} className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ObjectionsPlaybook;
