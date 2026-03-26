import React, { useEffect, useState } from 'react';
import { BarChart3, Download, Loader2, Filter, Users, Calendar, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { TeamMember } from '@/types';

interface ReportData {
  leadsByPeriod: { date: string; count: number }[];
  dealsByStage: { stage: string; count: number; value: number }[];
  bySeller: { name: string; leads: number; deals: number }[];
  byCity: { city: string; count: number }[];
  byCustomerType: { type: string; count: number }[];
  byService: { service: string; count: number }[];
}

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterDays, setFilterDays] = useState(30);

  useEffect(() => {
    api.fetchTeam().then(setTeamMembers).catch(console.error);
  }, []);

  useEffect(() => {
    loadReports();
  }, [filterSeller, filterDays]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - filterDays);
      const sinceStr = since.toISOString();

      // Leads by period
      let contactsQuery = supabase.from('contacts').select('created_at, city, customer_type, interest_services, assigned_user_id').gte('created_at', sinceStr);
      if (filterSeller !== 'all') contactsQuery = contactsQuery.eq('assigned_user_id', filterSeller);
      const { data: contacts } = await contactsQuery;

      const leadsByDate: Record<string, number> = {};
      const byCity: Record<string, number> = {};
      const byType: Record<string, number> = {};
      const byService: Record<string, number> = {};

      (contacts || []).forEach((c: any) => {
        const d = new Date(c.created_at).toLocaleDateString('pt-BR');
        leadsByDate[d] = (leadsByDate[d] || 0) + 1;
        if (c.city) byCity[c.city] = (byCity[c.city] || 0) + 1;
        if (c.customer_type) byType[c.customer_type] = (byType[c.customer_type] || 0) + 1;
        (c.interest_services || []).forEach((s: string) => { byService[s] = (byService[s] || 0) + 1; });
      });

      // Deals by stage
      let dealsQuery = supabase.from('deals').select('stage, value, user_id, stage_id, pipeline_stages(title)').gte('created_at', sinceStr);
      if (filterSeller !== 'all') dealsQuery = dealsQuery.eq('user_id', filterSeller);
      const { data: deals } = await dealsQuery;

      const stageMap: Record<string, { count: number; value: number }> = {};
      (deals || []).forEach((d: any) => {
        const stageName = (d as any).pipeline_stages?.title || d.stage || 'Sem etapa';
        if (!stageMap[stageName]) stageMap[stageName] = { count: 0, value: 0 };
        stageMap[stageName].count++;
        stageMap[stageName].value += Number(d.value) || 0;
      });

      // By seller
      const sellerMap: Record<string, { leads: number; deals: number; name: string }> = {};
      teamMembers.filter(m => m.user_id).forEach(m => {
        sellerMap[m.user_id!] = { name: m.name, leads: 0, deals: 0 };
      });
      (contacts || []).forEach((c: any) => {
        if (c.assigned_user_id && sellerMap[c.assigned_user_id]) sellerMap[c.assigned_user_id].leads++;
      });
      (deals || []).forEach((d: any) => {
        if (d.user_id && sellerMap[d.user_id]) sellerMap[d.user_id].deals++;
      });

      setData({
        leadsByPeriod: Object.entries(leadsByDate).map(([date, count]) => ({ date, count })).reverse(),
        dealsByStage: Object.entries(stageMap).map(([stage, v]) => ({ stage, ...v })),
        bySeller: Object.values(sellerMap),
        byCity: Object.entries(byCity).map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count),
        byCustomerType: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
        byService: Object.entries(byService).map(([service, count]) => ({ service, count })).sort((a, b) => b.count - a.count),
      });
    } catch (err) {
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Cidade', 'Leads'], ...data.byCity.map(c => [c.city, String(c.count)])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full bg-slate-950 text-slate-50 custom-scrollbar">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Relatórios</h2>
          <p className="text-slate-400 mt-1">Métricas e análises da operação</p>
        </div>
        <div className="flex gap-3 items-center">
          <select value={filterSeller} onChange={e => setFilterSeller(e.target.value)} className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 outline-none">
            <option value="all">Todos vendedores</option>
            {teamMembers.filter(m => m.user_id).map(m => (
              <option key={m.user_id} value={m.user_id!}>{m.name}</option>
            ))}
          </select>
          <select value={filterDays} onChange={e => setFilterDays(Number(e.target.value))} className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 outline-none">
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/20 transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-xs text-slate-500 uppercase">Leads no período</p>
              <p className="text-2xl font-bold text-white mt-1">{data.leadsByPeriod.reduce((s, l) => s + l.count, 0)}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-xs text-slate-500 uppercase">Deals ativos</p>
              <p className="text-2xl font-bold text-white mt-1">{data.dealsByStage.reduce((s, d) => s + d.count, 0)}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-xs text-slate-500 uppercase">Valor total</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.dealsByStage.reduce((s, d) => s + d.value, 0))}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-xs text-slate-500 uppercase">Cidades</p>
              <p className="text-2xl font-bold text-white mt-1">{data.byCity.length}</p>
            </div>
          </div>

          {/* Tables Grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* By Stage */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-cyan-400" /> Por Etapa</h3>
              <div className="space-y-2">
                {data.dealsByStage.map(s => (
                  <div key={s.stage} className="flex justify-between items-center py-1.5 border-b border-slate-800/50">
                    <span className="text-sm text-slate-300">{s.stage}</span>
                    <div className="flex gap-3">
                      <span className="text-xs text-slate-500">{s.count} deals</span>
                      <span className="text-xs text-emerald-400 font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Seller */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-violet-400" /> Por Vendedor</h3>
              <div className="space-y-2">
                {data.bySeller.map(s => (
                  <div key={s.name} className="flex justify-between items-center py-1.5 border-b border-slate-800/50">
                    <span className="text-sm text-slate-300">{s.name}</span>
                    <div className="flex gap-3">
                      <span className="text-xs text-slate-500">{s.leads} leads</span>
                      <span className="text-xs text-cyan-400">{s.deals} deals</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By City */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Por Cidade</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {data.byCity.map(c => (
                  <div key={c.city} className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-sm text-slate-300">{c.city}</span>
                    <span className="text-xs text-slate-400">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By Type + Service */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Por Tipo & Serviço</h3>
              <div className="space-y-3">
                {data.byCustomerType.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase mb-1">Tipo Cliente</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.byCustomerType.map(t => (
                        <span key={t.type} className="px-2 py-0.5 bg-violet-500/10 text-violet-400 text-xs rounded border border-violet-500/20">{t.type} ({t.count})</span>
                      ))}
                    </div>
                  </div>
                )}
                {data.byService.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase mb-1">Serviços</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.byService.map(s => (
                        <span key={s.service} className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded border border-cyan-500/20">{s.service} ({s.count})</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Reports;
