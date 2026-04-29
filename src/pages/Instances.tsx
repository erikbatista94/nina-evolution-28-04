import React, { useEffect, useState } from 'react';
import { Zap, Plus, Loader2, X, Eye, EyeOff, Wifi, WifiOff, Webhook, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/Button';

interface Instance {
  id: string;
  company_id: string;
  user_id: string | null;
  name: string;
  evolution_api_url: string;
  evolution_api_key: string;
  evolution_instance: string;
  connection_status: string;
  is_active: boolean;
}
interface Company { id: string; name: string }
interface TeamMember { id: string; name: string; user_id: string | null; company_id: string | null }

const Instances: React.FC = () => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Instance | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    company_id: '', user_id: '', name: '',
    evolution_api_url: '', evolution_api_key: '', evolution_instance: '',
  });

  const load = async () => {
    setLoading(true);
    const [{ data: insts }, { data: comps }, { data: tms }] = await Promise.all([
      supabase.from('instances' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('companies' as any).select('id, name').order('name'),
      supabase.from('team_members').select('id, name, user_id, company_id'),
    ]);
    setInstances((insts as any) || []);
    setCompanies((comps as any) || []);
    setMembers((tms as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ company_id: '', user_id: '', name: '', evolution_api_url: '', evolution_api_key: '', evolution_instance: '' });
    setShowModal(true);
  };
  const openEdit = (i: Instance) => {
    setEditing(i);
    setForm({
      company_id: i.company_id, user_id: i.user_id || '', name: i.name,
      evolution_api_url: i.evolution_api_url, evolution_api_key: i.evolution_api_key,
      evolution_instance: i.evolution_instance,
    });
    setShowModal(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_id || !form.name || !form.evolution_api_url || !form.evolution_api_key || !form.evolution_instance) {
      toast.error('Preencha todos os campos obrigatórios'); return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: form.company_id,
        user_id: form.user_id || null,
        name: form.name,
        evolution_api_url: form.evolution_api_url.replace(/\/+$/, ''),
        evolution_api_key: form.evolution_api_key,
        evolution_instance: form.evolution_instance,
      };
      if (editing) {
        const { error } = await supabase.from('instances' as any).update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Instância atualizada');
      } else {
        const { error } = await supabase.from('instances' as any).insert(payload);
        if (error) throw error;
        toast.success('Instância criada');
      }
      setShowModal(false); await load();
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const remove = async (i: Instance) => {
    if (!confirm(`Remover instância "${i.name}"?`)) return;
    const { error } = await supabase.from('instances' as any).delete().eq('id', i.id);
    if (error) toast.error('Erro ao remover');
    else { toast.success('Removida'); load(); }
  };

  const test = async (i: Instance) => {
    setTestingId(i.id);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-test', {
        body: { url: i.evolution_api_url, apiKey: i.evolution_api_key, instance: i.evolution_instance },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Conectado: ${data.instanceState || 'open'}`);
        await supabase.from('instances' as any).update({
          connection_status: 'connected', last_connected_at: new Date().toISOString(),
        }).eq('id', i.id);
        load();
      } else {
        toast.error(data?.error || 'Falha');
        await supabase.from('instances' as any).update({ connection_status: 'disconnected' }).eq('id', i.id);
        load();
      }
    } catch (err: any) { toast.error(err.message || 'Erro ao testar'); }
    finally { setTestingId(null); }
  };

  const setupWebhook = async (i: Instance) => {
    try {
      const { data, error } = await supabase.functions.invoke('evolution-configure-webhook', {
        body: { url: i.evolution_api_url, apiKey: i.evolution_api_key, instance: i.evolution_instance },
      });
      if (error) throw error;
      if (data?.ok) toast.success('Webhook configurado');
      else toast.error(data?.error || 'Falha');
    } catch (err: any) { toast.error(err.message || 'Erro'); }
  };

  const filtered = filterCompany === 'all' ? instances : instances.filter(i => i.company_id === filterCompany);
  const memberById = (uid: string | null) => members.find(m => m.user_id === uid)?.name || '-';
  const companyById = (cid: string) => companies.find(c => c.id === cid)?.name || '-';
  const availableMembers = form.company_id ? members.filter(m => m.company_id === form.company_id && m.user_id) : [];

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50 custom-scrollbar">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Zap className="w-8 h-8 text-primary" /> Instâncias
          </h2>
          <p className="text-sm text-slate-400 mt-1">Conexões WhatsApp por cliente</p>
        </div>
        <div className="flex gap-3">
          <select
            value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm"
          >
            <option value="all">Todas as empresas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Nova Instância</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Zap className="w-12 h-12 mx-auto mb-3 opacity-40" />Nenhuma instância</div>
      ) : (
        <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50">
              <tr className="text-left text-xs text-slate-500 uppercase">
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Instance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {filtered.map(i => (
                <tr key={i.id} className="hover:bg-slate-800/20">
                  <td className="px-4 py-3 text-slate-300">{companyById(i.company_id)}</td>
                  <td className="px-4 py-3 font-medium text-white">{i.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{i.evolution_instance}</td>
                  <td className="px-4 py-3">
                    {i.connection_status === 'connected' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-bold border border-emerald-500/20">
                        <Wifi className="w-3 h-3" /> CONECTADO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 rounded-full text-[10px] font-bold border border-red-500/20">
                        <WifiOff className="w-3 h-3" /> DESCONECTADO
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{memberById(i.user_id)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => test(i)} disabled={testingId === i.id}
                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400" title="Testar">
                        {testingId === i.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setupWebhook(i)} className="p-1.5 hover:bg-slate-800 rounded text-slate-400" title="Configurar webhook"><Webhook className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(i)} className="p-1.5 hover:bg-slate-800 rounded text-slate-400" title="Editar"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(i)} className="p-1.5 hover:bg-red-900/30 rounded text-red-400" title="Remover"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">{editing ? 'Editar Instância' : 'Nova Instância'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">Empresa *</label>
                <select value={form.company_id} onChange={(e) => setForm(f => ({ ...f, company_id: e.target.value, user_id: '' }))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm">
                  <option value="">Selecione…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Nome amigável *</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: João - Vendas"
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Funcionário (opcional)</label>
                <select value={form.user_id} onChange={(e) => setForm(f => ({ ...f, user_id: e.target.value }))} disabled={!form.company_id}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm disabled:opacity-50">
                  <option value="">— sem vínculo —</option>
                  {availableMembers.map(m => <option key={m.id} value={m.user_id!}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Evolution API URL *</label>
                <input value={form.evolution_api_url} onChange={(e) => setForm(f => ({ ...f, evolution_api_url: e.target.value }))}
                  placeholder="https://evo.example.com" className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400">API Key *</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={form.evolution_api_key}
                    onChange={(e) => setForm(f => ({ ...f, evolution_api_key: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 pr-10 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono" />
                  <button type="button" onClick={() => setShowKey(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400">Instance Name *</label>
                <input value={form.evolution_instance} onChange={(e) => setForm(f => ({ ...f, evolution_instance: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Instances;
