import React, { useEffect, useState } from 'react';
import { Building2, Plus, Loader2, X, Power, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/Button';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  max_instances: number;
  is_active: boolean;
  billing_email: string | null;
  notes: string | null;
  created_at: string;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const Companies: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [instanceCounts, setInstanceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    plan: 'basic',
    max_instances: 1,
    billing_email: '',
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar empresas');
    setCompanies((data as any) || []);
    const { data: instances } = await supabase
      .from('instances' as any)
      .select('company_id, is_active');
    const counts: Record<string, number> = {};
    ((instances as any) || []).forEach((i: any) => {
      if (i.is_active) counts[i.company_id] = (counts[i.company_id] || 0) + 1;
    });
    setInstanceCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', slug: '', plan: 'basic', max_instances: 1, billing_email: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({
      name: c.name,
      slug: c.slug,
      plan: c.plan,
      max_instances: c.max_instances,
      billing_email: c.billing_email || '',
      notes: c.notes || '',
    });
    setShowModal(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Nome e slug são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from('companies' as any)
          .update({
            name: form.name,
            slug: form.slug,
            plan: form.plan,
            max_instances: form.max_instances,
            billing_email: form.billing_email || null,
            notes: form.notes || null,
          })
          .eq('id', editing.id);
        if (error) throw error;
        toast.success('Empresa atualizada');
      } else {
        const { error } = await supabase.from('companies' as any).insert({
          name: form.name,
          slug: form.slug,
          plan: form.plan,
          max_instances: form.max_instances,
          billing_email: form.billing_email || null,
          notes: form.notes || null,
        });
        if (error) throw error;
        toast.success('Empresa criada');
      }
      setShowModal(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Company) => {
    const { error } = await supabase
      .from('companies' as any)
      .update({ is_active: !c.is_active })
      .eq('id', c.id);
    if (error) toast.error('Erro ao alterar status');
    else {
      toast.success(c.is_active ? 'Empresa desativada' : 'Empresa ativada');
      load();
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50 custom-scrollbar">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Building2 className="w-8 h-8 text-primary" /> Empresas
          </h2>
          <p className="text-sm text-slate-400 mt-1">Gerencie seus clientes</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Empresa
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          Nenhuma empresa cadastrada
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <div
              key={c.id}
              className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{c.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">{c.slug}</p>
                </div>
                <span
                  className={`px-2 py-1 text-[10px] font-bold rounded-full ${
                    c.is_active
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-700/40 text-slate-500'
                  }`}
                >
                  {c.is_active ? 'ATIVA' : 'INATIVA'}
                </span>
              </div>
              <div className="flex gap-4 text-xs mb-4">
                <div>
                  <span className="text-slate-500">Plano: </span>
                  <span className="text-slate-200 font-semibold uppercase">{c.plan}</span>
                </div>
                <div>
                  <span className="text-slate-500">Instâncias: </span>
                  <span className="text-slate-200 font-semibold">
                    {instanceCounts[c.id] || 0}/{c.max_instances}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 text-xs" onClick={() => openEdit(c)}>
                  <Pencil className="w-3 h-3 mr-1" /> Editar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => toggleActive(c)}
                >
                  <Power className="w-3 h-3 mr-1" /> {c.is_active ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={submit}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">
                {editing ? 'Editar Empresa' : 'Nova Empresa'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">Nome *</label>
                <input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug: !editing ? slugify(name) : f.slug,
                    }));
                  }}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Slug *</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Plano</label>
                  <select
                    value={form.plan}
                    onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"
                  >
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Máx. Instâncias</label>
                  <input
                    type="number"
                    min={1}
                    value={form.max_instances}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, max_instances: parseInt(e.target.value) || 1 }))
                    }
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400">Email de cobrança</label>
                <input
                  type="email"
                  value={form.billing_email}
                  onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Notas internas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </Button>
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

export default Companies;
