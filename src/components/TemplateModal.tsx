import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Send, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Template {
  id: string;
  name: string;
  display_name: string;
  content: string;
  variables: { key: string; label: string; auto_fill?: string }[];
  is_active: boolean;
}

interface TemplateModalProps {
  open: boolean;
  onClose: () => void;
  contactId: string;
  conversationId: string;
  contactName?: string;
  contactInterests?: string[];
  userId?: string;
  onSent?: () => void;
}

const TemplateModal: React.FC<TemplateModalProps> = ({
  open, onClose, contactId, conversationId, contactName, contactInterests, userId, onSent
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('is_active', true)
      .order('display_name')
      .then(({ data }) => {
        const parsed = (data || []).map((t: any) => ({
          ...t,
          variables: Array.isArray(t.variables) ? t.variables : JSON.parse(t.variables || '[]')
        }));
        setTemplates(parsed);
        setLoading(false);
      });
  }, [open]);

  useEffect(() => {
    if (!selectedTemplate) { setVariables({}); return; }
    const auto: Record<string, string> = {};
    selectedTemplate.variables.forEach(v => {
      if (v.auto_fill === 'contact.name' && contactName) {
        auto[v.key] = contactName;
      } else if (v.auto_fill === 'contact.interest_services' && contactInterests?.length) {
        auto[v.key] = contactInterests.join(', ');
      } else {
        auto[v.key] = '';
      }
    });
    setVariables(auto);
  }, [selectedTemplate, contactName, contactInterests]);

  const getPreview = () => {
    if (!selectedTemplate) return '';
    let text = selectedTemplate.content;
    Object.entries(variables).forEach(([key, val]) => {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`);
    });
    return text;
  };

  const allFilled = selectedTemplate?.variables.every(v => variables[v.key]?.trim()) ?? false;

  const handleSend = async () => {
    if (!selectedTemplate || !allFilled) return;
    setSending(true);
    try {
      const res = await supabase.functions.invoke('send-template', {
        body: {
          template_name: selectedTemplate.name,
          variables,
          contact_id: contactId,
          conversation_id: conversationId,
          user_id: userId
        }
      });

      if (res.error) {
        throw new Error(res.error.message || 'Erro ao enviar template');
      }
      
      const data = res.data as any;
      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success('Template enviado com sucesso!');
      onSent?.();
      onClose();
    } catch (err: any) {
      console.error('[TemplateModal] Error:', err);
      toast.error(err.message || 'Erro ao enviar template');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Reengajar Cliente</h3>
              <p className="text-xs text-slate-400">Envie um template aprovado para reabrir a conversa</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Nenhum template ativo encontrado.</p>
              <p className="text-xs text-slate-500 mt-1">Cadastre templates em Configurações → Templates.</p>
            </div>
          ) : (
            <>
              {/* Template selection */}
              <div>
                <label className="text-xs text-slate-400 uppercase font-medium mb-2 block">Selecione o template</label>
                <div className="space-y-2">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedTemplate?.id === t.id
                          ? 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/20'
                          : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{t.display_name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{t.name}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Variables */}
              {selectedTemplate && selectedTemplate.variables.length > 0 && (
                <div>
                  <label className="text-xs text-slate-400 uppercase font-medium mb-2 block">Variáveis</label>
                  <div className="space-y-3">
                    {selectedTemplate.variables.map(v => (
                      <div key={v.key}>
                        <label className="text-xs text-slate-500 mb-1 block">
                          {`{{${v.key}}}`} — {v.label}
                        </label>
                        <input
                          type="text"
                          value={variables[v.key] || ''}
                          onChange={e => setVariables(prev => ({ ...prev, [v.key]: e.target.value }))}
                          className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/50"
                          placeholder={v.label}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {selectedTemplate && (
                <div>
                  <label className="text-xs text-slate-400 uppercase font-medium mb-2 block">Preview</label>
                  <div className="p-4 bg-slate-950/80 border border-slate-700/50 rounded-xl">
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{getPreview()}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={!selectedTemplate || !allFilled || sending}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar Template
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateModal;
