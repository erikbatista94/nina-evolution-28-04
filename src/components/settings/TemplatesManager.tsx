import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, Loader2, FileText, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface Template {
  id: string;
  name: string;
  display_name: string;
  content: string;
  variables: { key: string; label: string; auto_fill?: string }[];
  language: string;
  is_active: boolean;
  created_at: string;
}

interface EditingTemplate {
  id?: string;
  name: string;
  display_name: string;
  content: string;
  variables: { key: string; label: string; auto_fill: string }[];
  language: string;
}

const EMPTY_TEMPLATE: EditingTemplate = {
  name: '', display_name: '', content: '', variables: [], language: 'pt_BR'
};

const TemplatesManager: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    const query = supabase.from('whatsapp_templates').select('*').order('display_name');
    if (!showInactive) query.eq('is_active', true);
    const { data } = await query;
    setTemplates((data || []).map((t: any) => ({
      ...t,
      variables: Array.isArray(t.variables) ? t.variables : JSON.parse(t.variables || '[]')
    })));
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, [showInactive]);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.display_name.trim() || !editing.content.trim()) {
      toast.error('Preencha nome, título e conteúdo');
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        const { error } = await supabase.from('whatsapp_templates').update({
          name: editing.name, display_name: editing.display_name,
          content: editing.content, variables: editing.variables as any,
          language: editing.language
        }).eq('id', editing.id);
        if (error) throw error;
        toast.success('Template atualizado');
      } else {
        const { error } = await supabase.from('whatsapp_templates').insert({
          name: editing.name, display_name: editing.display_name,
          content: editing.content, variables: editing.variables as any,
          language: editing.language
        });
        if (error) throw error;
        toast.success('Template criado');
      }
      setEditing(null);
      loadTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    const { error } = await supabase.from('whatsapp_templates').update({ is_active: false }).eq('id', id);
    if (error) { toast.error('Erro ao desativar'); return; }
    toast.success('Template desativado');
    loadTemplates();
  };

  const handleReactivate = async (id: string) => {
    const { error } = await supabase.from('whatsapp_templates').update({ is_active: true }).eq('id', id);
    if (error) { toast.error('Erro ao reativar'); return; }
    toast.success('Template reativado');
    loadTemplates();
  };

  const addVariable = () => {
    if (!editing) return;
    const nextKey = String(editing.variables.length + 1);
    setEditing({ ...editing, variables: [...editing.variables, { key: nextKey, label: '', auto_fill: '' }] });
  };

  const removeVariable = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, variables: editing.variables.filter((_, i) => i !== idx) });
  };

  const updateVariable = (idx: number, field: string, value: string) => {
    if (!editing) return;
    const updated = [...editing.variables];
    (updated[idx] as any)[field] = value;
    setEditing({ ...editing, variables: updated });
  };

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{editing.id ? 'Editar Template' : 'Novo Template'}</h3>
          <button onClick={() => setEditing(null)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nome interno (Meta)</label>
            <input
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/50"
              placeholder="nome_do_template"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Título para exibição</label>
            <input
              value={editing.display_name}
              onChange={e => setEditing({ ...editing, display_name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/50"
              placeholder="Continuidade de Atendimento"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Conteúdo (use {"{{1}}"}, {"{{2}}"} para variáveis)</label>
          <textarea
            value={editing.content}
            onChange={e => setEditing({ ...editing, content: e.target.value })}
            rows={5}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/50 resize-none"
            placeholder="Olá {{1}}, tudo bem?..."
          />
        </div>

        {/* Variables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">Variáveis</label>
            <button onClick={addVariable} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>
          <div className="space-y-2">
            {editing.variables.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-10 text-center font-mono">{`{{${v.key}}}`}</span>
                <input
                  value={v.label}
                  onChange={e => updateVariable(i, 'label', e.target.value)}
                  placeholder="Descrição"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none"
                />
                <select
                  value={v.auto_fill}
                  onChange={e => updateVariable(i, 'auto_fill', e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none"
                >
                  <option value="">Manual</option>
                  <option value="contact.name">Nome do contato</option>
                  <option value="contact.interest_services">Serviços de interesse</option>
                </select>
                <button onClick={() => removeVariable(i)} className="p-1 text-red-400 hover:text-red-300">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Templates WhatsApp</h3>
          <p className="text-xs text-slate-400 mt-0.5">Gerencie os templates de reengajamento</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            Mostrar inativos
          </label>
          <button
            onClick={() => setEditing({ ...EMPTY_TEMPLATE })}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Template
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">Nenhum template encontrado.</div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className={`p-4 rounded-xl border ${t.is_active ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-900/50 border-slate-800/50 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <h4 className="text-sm font-semibold text-white truncate">{t.display_name}</h4>
                    {!t.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Inativo</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">{t.name}</p>
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2 whitespace-pre-wrap">{t.content}</p>
                  {t.variables.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {t.variables.map((v: any) => (
                        <span key={v.key} className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-400">
                          {`{{${v.key}}}`} {v.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => setEditing({
                      id: t.id, name: t.name, display_name: t.display_name,
                      content: t.content, variables: t.variables as any, language: t.language
                    })}
                    className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {t.is_active ? (
                    <button
                      onClick={() => handleDeactivate(t.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                      title="Desativar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(t.id)}
                      className="p-2 rounded-lg hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-400 transition-colors text-xs"
                      title="Reativar"
                    >
                      Reativar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TemplatesManager;
