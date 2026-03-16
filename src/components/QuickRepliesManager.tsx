import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { X, Plus, Pencil, Trash2, Zap, Save } from 'lucide-react';
import { Input } from './ui/input';

interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  content: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export const QuickRepliesManager: React.FC<Props> = ({ open, onClose }) => {
  const { user } = useAuth();
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ shortcut: '/', title: '', content: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) fetchReplies();
  }, [open, user]);

  const fetchReplies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .eq('user_id', user!.id)
      .order('shortcut');
    if (error) {
      toast.error('Erro ao carregar mensagens rápidas');
    } else {
      setReplies((data || []) as QuickReply[]);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ shortcut: '/', title: '', content: '' });
    setEditingId(null);
  };

  const validate = (): string | null => {
    if (!form.shortcut.startsWith('/')) return 'Atalho deve começar com /';
    if (form.shortcut.length < 2) return 'Atalho muito curto';
    if (form.shortcut.includes(' ')) return 'Atalho não pode ter espaços';
    if (!form.title.trim()) return 'Título obrigatório';
    if (!form.content.trim()) return 'Conteúdo obrigatório';
    if (form.content.length > 2000) return 'Conteúdo muito longo (máx 2000 caracteres)';
    const duplicate = replies.find(r => r.shortcut === form.shortcut && r.id !== editingId);
    if (duplicate) return 'Atalho já existe';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from('quick_replies')
        .update({ shortcut: form.shortcut, title: form.title, content: form.content })
        .eq('id', editingId);
      if (error) toast.error('Erro ao atualizar');
      else toast.success('Atualizado');
    } else {
      const { error } = await supabase
        .from('quick_replies')
        .insert({ user_id: user!.id, shortcut: form.shortcut, title: form.title, content: form.content });
      if (error) {
        if (error.code === '23505') toast.error('Atalho já existe');
        else toast.error('Erro ao criar');
      } else toast.success('Criado');
    }

    setSaving(false);
    resetForm();
    fetchReplies();
  };

  const handleEdit = (r: QuickReply) => {
    setEditingId(r.id);
    setForm({ shortcut: r.shortcut, title: r.title, content: r.content });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('quick_replies').delete().eq('id', id);
    if (error) toast.error('Erro ao excluir');
    else {
      toast.success('Excluído');
      fetchReplies();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-foreground">Mensagens Rápidas</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex gap-2">
            <Input
              value={form.shortcut}
              onChange={e => setForm(f => ({ ...f, shortcut: e.target.value.toLowerCase().replace(/\s/g, '') }))}
              placeholder="/atalho"
              className="w-32 font-mono text-sm"
            />
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Título"
              className="flex-1 text-sm"
            />
          </div>
          <textarea
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder="Conteúdo da mensagem..."
            className="w-full bg-secondary/50 border border-input rounded-md p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[80px]"
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{form.content.length}/2000</span>
            <div className="flex gap-2">
              {editingId && (
                <button onClick={resetForm} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {editingId ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {editingId ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : replies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem rápida. Crie a primeira!</p>
          ) : (
            replies.map(r => (
              <div key={r.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-xs font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">{r.shortcut}</code>
                      <span className="text-sm font-medium text-foreground truncate">{r.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.content}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(r)} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
