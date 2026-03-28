import React, { useEffect, useState } from 'react';
import { BarChart3, Download, Loader2, Users, TrendingUp, Clock, Award } from 'lucide-react';
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

interface SellerPerformance {
  name: string;
  userId: string;
  avgFirstResponse: number; // minutes
  avgResponseTime: number; // minutes
  schedulingRate: number; // %
  slaAlerts: number;
  totalLeads: number;
  totalDeals: number;
}

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterDays, setFilterDays] = useState(30);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance'>('overview');
  const [perfData, setPerfData] = useState<SellerPerformance[]>([]);
  const [loadingPerf, setLoadingPerf] = useState(false);

  useEffect(() => {
    api.fetchTeam().then(setTeamMembers).catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') loadReports();
    else loadPerformance();
  }, [filterSeller, filterDays, activeTab]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - filterDays);
      const sinceStr = since.toISOString();

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

      let dealsQuery = supabase.from('deals').select('stage, value, user_id, stage_id, pipeline_stages(title)').gte('created_at', sinceStr);
      if (filterSeller !== 'all') dealsQuery = dealsQuery.eq('user_id', filterSeller);
      const { data: deals } = await dealsQuery;

      const stageMap: Record<string, { count: number; value: number }> = {};
      (deals || []).forEach((d: any) => {
        const stageName = d.pipeline_stages?.title || d.stage || 'Sem etapa';
        if (!stageMap[stageName]) stageMap[stageName] = { count: 0, value: 0 };
        stageMap[stageName].count++;
        stageMap[stageName].value += Number(d.value) || 0;
      });

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

  const loadPerformance = async () => {
    setLoadingPerf(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - filterDays);
      const sinceStr = since.toISOString();

      const sellers = teamMembers.filter(m => m.user_id);
      const results: SellerPerformance[] = [];

      for (const seller of sellers) {
        if (filterSeller !== 'all' && seller.user_id !== filterSeller) continue;

        // Get conversations assigned to this seller
        const { data: convs } = await supabase
          .from('conversations')
          .select('id')
          .eq('assigned_user_id', seller.user_id!)
          .gte('created_at', sinceStr)
          .limit(200);
        const convIds = (convs || []).map(c => c.id);

        let avgFirst = 0;
        let avgResp = 0;

        if (convIds.length > 0) {
          // Get messages for response time calculation (sample up to 50 conversations)
          const sampleIds = convIds.slice(0, 50);
          const { data: msgs } = await supabase
            .from('messages')
            .select('conversation_id, from_type, sent_at')
            .in('conversation_id', sampleIds)
            .order('sent_at', { ascending: true })
            .limit(1000);

          if (msgs && msgs.length > 0) {
            const firstResponses: number[] = [];
            const allResponses: number[] = [];

            // Group by conversation
            const byConv: Record<string, any[]> = {};
            msgs.forEach(m => {
              if (!byConv[m.conversation_id]) byConv[m.conversation_id] = [];
              byConv[m.conversation_id].push(m);
            });

            Object.values(byConv).forEach(convMsgs => {
              let firstFound = false;
              for (let i = 0; i < convMsgs.length; i++) {
                if (convMsgs[i].from_type === 'user') {
                  // Find next human response
                  for (let j = i + 1; j < convMsgs.length; j++) {
                    if (convMsgs[j].from_type === 'human') {
                      const diff = (new Date(convMsgs[j].sent_at).getTime() - new Date(convMsgs[i].sent_at).getTime()) / 60000;
                      if (diff > 0 && diff < 1440) { // max 24h
                        allResponses.push(diff);
                        if (!firstFound) {
                          firstResponses.push(diff);
                          firstFound = true;
                        }
                      }
                      break;
                    }
                  }
                }
              }
            });

            avgFirst = firstResponses.length > 0 ? firstResponses.reduce((a, b) => a + b, 0) / firstResponses.length : 0;
            avgResp = allResponses.length > 0 ? allResponses.reduce((a, b) => a + b, 0) / allResponses.length : 0;
          }
        }

        // Contacts count
        const { count: leadsCount } = await supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_user_id', seller.user_id!)
          .gte('created_at', sinceStr);

        // Deals count
        const { count: dealsCount } = await supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', seller.user_id!)
          .gte('created_at', sinceStr);

        // Appointments count
        const { count: apptCount } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', seller.user_id!)
          .gte('created_at', sinceStr);

        // SLA alerts count
        const { count: slaCount } = await supabase
          .from('sla_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_user_id', seller.user_id!)
          .gte('created_at', sinceStr);

        const totalLeads = leadsCount || 0;
        const schedulingRate = totalLeads > 0 ? ((apptCount || 0) / totalLeads) * 100 : 0;

        results.push({
          name: seller.name,
          userId: seller.user_id!,
          avgFirstResponse: Math.round(avgFirst),
          avgResponseTime: Math.round(avgResp),
          schedulingRate: Math.round(schedulingRate),
          slaAlerts: slaCount || 0,
          totalLeads,
          totalDeals: dealsCount || 0,
        });
      }

      // Sort by scheduling rate desc
      results.sort((a, b) => b.schedulingRate - a.schedulingRate);
      setPerfData(results);
    } catch (err) {
      console.error('Error loading performance:', err);
    } finally {
      setLoadingPerf(false);
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

  const exportPerfCSV = () => {
    const rows = [
      ['Vendedor', 'Leads', 'Deals', '1ª Resposta (min)', 'Resp. Média (min)', 'Taxa Agend. (%)', 'Alertas SLA'],
      ...perfData.map(p => [p.name, String(p.totalLeads), String(p.totalDeals), String(p.avgFirstResponse), String(p.avgResponseTime), String(p.schedulingRate), String(p.slaAlerts)])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatMinutes = (min: number) => {
    if (min < 1) return '< 1 min';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

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
          <button onClick={activeTab === 'performance' ? exportPerfCSV : exportCSV} className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/20 transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-800 pb-0">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          <BarChart3 className="w-4 h-4 inline mr-1.5" />Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'performance' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          <Award className="w-4 h-4 inline mr-1.5" />Performance
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : data && (
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
        </>
      )}

      {activeTab === 'performance' && (
        <>
          {loadingPerf ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Ranking Table */}
              <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="p-5 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" /> Ranking de Vendedores
                  </h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-800">
                      <th className="text-left p-3 font-medium">#</th>
                      <th className="text-left p-3 font-medium">Vendedor</th>
                      <th className="text-center p-3 font-medium">Leads</th>
                      <th className="text-center p-3 font-medium">Deals</th>
                      <th className="text-center p-3 font-medium">1ª Resposta</th>
                      <th className="text-center p-3 font-medium">Resp. Média</th>
                      <th className="text-center p-3 font-medium">Taxa Agend.</th>
                      <th className="text-center p-3 font-medium">Alertas SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfData.map((p, idx) => (
                      <tr key={p.userId} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="p-3">
                          <span className={`text-sm font-bold ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-slate-500'}`}>
                            {idx + 1}º
                          </span>
                        </td>
                        <td className="p-3 text-sm text-slate-200 font-medium">{p.name}</td>
                        <td className="p-3 text-center text-sm text-slate-300">{p.totalLeads}</td>
                        <td className="p-3 text-center text-sm text-cyan-400">{p.totalDeals}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded ${p.avgFirstResponse <= 10 ? 'bg-emerald-500/10 text-emerald-400' : p.avgFirstResponse <= 30 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                            {p.avgFirstResponse > 0 ? formatMinutes(p.avgFirstResponse) : '—'}
                          </span>
                        </td>
                        <td className="p-3 text-center text-xs text-slate-400">
                          {p.avgResponseTime > 0 ? formatMinutes(p.avgResponseTime) : '—'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-xs font-medium ${p.schedulingRate >= 30 ? 'text-emerald-400' : p.schedulingRate >= 15 ? 'text-amber-400' : 'text-slate-500'}`}>
                            {p.schedulingRate}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-xs ${p.slaAlerts > 5 ? 'text-red-400' : p.slaAlerts > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {p.slaAlerts}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {perfData.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Nenhum dado de performance encontrado
                  </div>
                )}
              </div>

              {/* Performance Cards */}
              <div className="grid grid-cols-3 gap-4">
                {perfData.slice(0, 3).map((p, idx) => (
                  <div key={p.userId} className={`p-4 rounded-xl border ${idx === 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-lg font-bold ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : 'text-orange-400'}`}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                      </span>
                      <span className="text-sm font-semibold text-slate-200">{p.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-slate-500">1ª Resp:</span> <span className="text-slate-200">{p.avgFirstResponse > 0 ? formatMinutes(p.avgFirstResponse) : '—'}</span></div>
                      <div><span className="text-slate-500">Agend.:</span> <span className="text-slate-200">{p.schedulingRate}%</span></div>
                      <div><span className="text-slate-500">Leads:</span> <span className="text-slate-200">{p.totalLeads}</span></div>
                      <div><span className="text-slate-500">SLA:</span> <span className={p.slaAlerts > 3 ? 'text-red-400' : 'text-slate-200'}>{p.slaAlerts}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Reports;
