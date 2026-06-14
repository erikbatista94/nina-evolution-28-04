import React, { useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Loader2, X, Trash2, KeyRound, Copy, Check, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/Button';
import { useCompanyContext } from '@/hooks/useCompanyContext';

interface Company { id: string; name: string }
interface Member {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: string;
  status: string;
  company_id: string | null;
  whatsapp_number: string | null;
}

const Users: React.FC = () => {
  const { isSuperAdmin } = useCompanyContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', role: 'agent', company_id: '', whatsapp_number: '',
  });

  const load = async () => {
    setLoading(true);
    const [{ data: tms }, { data: comps }, { data: roles }] = await Promise.all([
      supabase.from('team_members').select('id, user_id, name, email, role, status, whatsapp_number'),
      supabase.from('companies' as any).select('id, name').order('name'),
      supabase.from('user_roles').select('user_id, company_id'),
    ]);
    const roleMap = new Map<string, string | null>();
    ((roles as any) || []).forEach((r: any) => roleMap.set(r.user_id, r.company_id));
    const withCompany = ((tms as any) || []).map((m: any) => ({
      ...m,
      company_id: m.user_id ? roleMap.get(m.user_id) ?? null : null,
    }));
    setMembers(withCompany);
    setCompanies((comps as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.company_id) {
      toast.error('Preencha nome, email e empresa');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          name: form.name,
          email: form.email,
          role: form.role,
          whatsapp_number: form.whatsapp_number || undefined,
          company_id: form.company_id,
          status: 'active',
        },
      });
      if (error) throw error;
      if ((data as any).error) throw new Error((data as any).error);
      setCredentials({ email: form.email, password: (data as any).temporary_password });
      setShowCreate(false);
      setForm({ name: '', email: '', role: 'agent', company_id: '', whatsapp_number: '' });
      toast.success('Usuário criado');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuário');
    } finally {
      setSaving(false);
    }
  };

  const changeCompany = async (m: Member, companyId: string) => {
    if (!m.user_id) { toast.error('Usuário sem auth user_id'); return; }
    const { error } = await supabase
      .from('user_roles')
      .update({ company_id: companyId || null })
      .eq('user_id', m.user_id);
    if (error) toast.error('Erro ao atualizar empresa');
    else { toast.success('Empresa atualizada'); load(); }
  };

  const changeRole = async (m: Member, role: string) => {
    const memberRole = role;
    const appRole = role === 'admin' ? 'admin' : 'user';
    const { error: e1 } = await supabase
      .from('team_members')
      .update({ role: memberRole as any })
      .eq('id', m.id);
    if (e1) { toast.error('Erro ao atualizar role'); return; }
    if (m.user_id) {
      await supabase.from('user_roles').update({ role: appRole as any }).eq('user_id', m.user_id);
    }
    toast.success('Role atualizada');
    load();
  };

  const resetPassword = async (m: Member) => {
    if (!confirm(`Gerar nova senha temporária para ${m.email}?`)) return;
    setResetting(m.id);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { email: m.email },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCredentials({ email: m.email, password: (data as any).temporary_password });
      toast.success('Senha redefinida');
    } catch (err: any) {
      toast.error(err.message || 'Erro');
    } finally {
      setResetting(null);
    }
  };

  const remove = async (m: Member) => {
    if (!confirm(`Remover ${m.name} da equipe? (não exclui a conta auth)`)) return;
    const { error } = await supabase.from('team_members').delete().eq('id', m.id);
    if (error) toast.error('Erro ao remover');
    else { toast.success('Removido'); load(); }
  };

  const copyPassword = async () => {
    if (!credentials) return;
    await navigator.clipboard.writeText(`Email: ${credentials.email}\nSenha: ${credentials.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const companyName = (id: string | null) =>
    id ? (companies.find(c => c.id === id)?.name || '—') : '—';

  const filtered = members.filter(m => {
    if (filterCompany !== 'all' && m.company_id !== filterCompany) return false;
    if (search) {
      const t = search.toLowerCase();
      if (!m.name.toLowerCase().includes(t) && !m.email.toLowerCase().includes(t)) return false;
    }
    return true;
  });

  // Group by company
  const grouped = filtered.reduce<Record<string, Member[]>>((acc, m) => {
    const key = m.company_id || 'unassigned';
    (acc[key] ||= []).push(m);
    return acc;
  }, {});

  if (!isSuperAdmin) {
    return <div className="p-8 text-slate-400">Acesso restrito a super administradores.</div>;
  }

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50 custom-scrollbar">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <UsersIcon className="w-8 h-8 text-primary" /> Usuários por Empresa
          </h2>
          <p className="text-sm text-slate-400 mt-1">Gerencie usuários de todas as empresas</p>
        </div>
        <div className="flex gap-3">
          <select
            value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm"
          >
            <option value="all">Todas as empresas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="unassigned">— Sem empresa —</option>
          </select>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Usuário
          </Button>
        </div>
      </div>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />Nenhum usuário
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([companyId, mems]) => (
            <div key={companyId} className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-white">
                  {companyId === 'unassigned' ? 'Sem empresa atribuída' : companyName(companyId)}
                </h3>
                <span className="text-xs text-slate-500">{mems.length} usuário(s)</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-900/40">
                  <tr className="text-left text-xs text-slate-500 uppercase">
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">WhatsApp</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Empresa</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {mems.map(m => (
                    <tr key={m.id} className="hover:bg-slate-800/20">
                      <td className="px-4 py-2 text-white">{m.name}</td>
                      <td className="px-4 py-2 text-slate-400">{m.email}</td>
                      <td className="px-4 py-2 text-slate-400">{m.whatsapp_number || '-'}</td>
                      <td className="px-4 py-2">
                        <select value={m.role} onChange={(e) => changeRole(m, e.target.value)}
                          className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs">
                          <option value="agent">Atendente</option>
                          <option value="manager">Gerente</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={m.company_id || ''} onChange={(e) => changeCompany(m, e.target.value)}
                          className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs">
                          <option value="">— sem empresa —</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <button onClick={() => resetPassword(m)} disabled={resetting === m.id}
                            className="p-1.5 hover:bg-slate-800 rounded text-amber-400" title="Redefinir senha">
                            {resetting === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                          </button>
                          <button onClick={() => remove(m)}
                            className="p-1.5 hover:bg-red-900/30 rounded text-red-400" title="Remover">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Novo Usuário</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">Empresa *</label>
                <select value={form.company_id} onChange={(e) => setForm(f => ({ ...f, company_id: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm">
                  <option value="">Selecione…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Nome *</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400">WhatsApp (E.164)</label>
                <input value={form.whatsapp_number} onChange={(e) => setForm(f => ({ ...f, whatsapp_number: e.target.value }))}
                  placeholder="+5511999999999"
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Role</label>
                <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm">
                  <option value="agent">Atendente</option>
                  <option value="manager">Gerente</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {credentials && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-emerald-300">Credenciais geradas</h3>
              <button onClick={() => setCredentials(null)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs text-slate-400 mb-1">Email</div>
            <code className="block px-3 py-2 bg-slate-950 border border-slate-800 rounded mb-3 text-sm">{credentials.email}</code>
            <div className="text-xs text-slate-400 mb-1">Senha temporária</div>
            <code className="block px-3 py-2 bg-slate-950 border border-slate-800 rounded mb-4 text-sm font-mono text-emerald-300">{credentials.password}</code>
            <Button onClick={copyPassword} variant="outline" className="w-full gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado' : 'Copiar credenciais'}
            </Button>
            <p className="text-xs text-amber-400 mt-3">O usuário deverá trocar a senha no primeiro login.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;