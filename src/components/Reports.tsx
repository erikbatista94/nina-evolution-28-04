import React, { useEffect, useState } from 'react';
import { BarChart3, Download, Loader2, Users, TrendingUp, Clock, Award, ShieldAlert, Filter, Megaphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { TeamMember } from '@/types';
import { useCompanySettings } from '@/hooks/useCompanySettings';

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
  avgFirstResponse: number;
  avgResponseTime: number;
  schedulingRate: number;
  slaAlerts: number;
  totalLeads: number;
  totalDeals: number;
}

interface AdvancedData {
  qualification: {
    byType: { dimension: string; value: string; count: number }[];
    byCity: { dimension: string; value: string; count: number }[];
    byNeighborhood: { dimension: string; value: string; count: number }[];
    byService: { dimension: string; value: string; count: number }[];
    byJobSize: { dimension: string; value: string; count: number }[];
    byProject: { dimension: string; value: string; count: number }[];
    byTimeframe: { dimension: string; value: string; count: number }[];
    byTemperature: { dimension: string; value: string; count: number }[];
    byScoreRange: { dimension: string; value: string; count: number }[];
  };
  objections: { title: string; category: string; count: number; triggers: string }[];
  funnel: { stage: string; count: number; total_value: number; conversion_pct: number }[];
  sellerRanking: { seller: string; leads: number; deals: number; appointments: number; rate: number; sla: number }[];
  sources: { source: string; leads: number; pct: number; qualified: number; appointments: number; conversionRate: number }[];
  objectionsSampled: number;
}

interface QualityData {
  totalConversations: number;
  qualifiedLeads: number;
  sentToHuman: number;
  resolvedByAI: number;
  gapsDetected: number;
  stalledLeads: number;
  followupSuccessRate: number;
  avgTimeToHuman: number;
  unownedHumanConvs: number;
  stalledHumanConvs: number;
  conversionsByType: { type: string; count: number }[];
  conversionsBySeller: { seller: string; won: number; lost: number; rate: number }[];
  funnelDropoff: { stage: string; count: number; dropPct: number }[];
  eventsByType: { type: string; count: number }[];
}

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterDays, setFilterDays] = useState(30);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'advanced' | 'quality'>('overview');
  const [perfData, setPerfData] = useState<SellerPerformance[]>([]);
  const [loadingPerf, setLoadingPerf] = useState(false);
  const [advData, setAdvData] = useState<AdvancedData | null>(null);
  const [loadingAdv, setLoadingAdv] = useState(false);
  const [qualityData, setQualityData] = useState<QualityData | null>(null);
  const [loadingQuality, setLoadingQuality] = useState(false);
  const { isAdmin } = useCompanySettings();

  useEffect(() => {
    api.fetchTeam().then(setTeamMembers).catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') loadReports();
    else if (activeTab === 'performance') loadPerformance();
    else if (activeTab === 'advanced') loadAdvanced();
    else if (activeTab === 'quality') loadQuality();
  }, [filterSeller, filterDays, activeTab]);

  // ── Overview ──
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

  // ── Performance ──
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
        const { data: convs } = await supabase.from('conversations').select('id').eq('assigned_user_id', seller.user_id!).gte('created_at', sinceStr).limit(200);
        const convIds = (convs || []).map(c => c.id);
        let avgFirst = 0, avgResp = 0;

        if (convIds.length > 0) {
          const sampleIds = convIds.slice(0, 50);
          const { data: msgs } = await supabase.from('messages').select('conversation_id, from_type, sent_at').in('conversation_id', sampleIds).order('sent_at', { ascending: true }).limit(1000);
          if (msgs && msgs.length > 0) {
            const firstResponses: number[] = [];
            const allResponses: number[] = [];
            const byConv: Record<string, any[]> = {};
            msgs.forEach(m => { if (!byConv[m.conversation_id]) byConv[m.conversation_id] = []; byConv[m.conversation_id].push(m); });
            Object.values(byConv).forEach(convMsgs => {
              let firstFound = false;
              for (let i = 0; i < convMsgs.length; i++) {
                if (convMsgs[i].from_type === 'user') {
                  for (let j = i + 1; j < convMsgs.length; j++) {
                    if (convMsgs[j].from_type === 'human') {
                      const diff = (new Date(convMsgs[j].sent_at).getTime() - new Date(convMsgs[i].sent_at).getTime()) / 60000;
                      if (diff > 0 && diff < 1440) {
                        allResponses.push(diff);
                        if (!firstFound) { firstResponses.push(diff); firstFound = true; }
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

        const { count: leadsCount } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('assigned_user_id', seller.user_id!).gte('created_at', sinceStr);
        const { count: dealsCount } = await supabase.from('deals').select('id', { count: 'exact', head: true }).eq('user_id', seller.user_id!).gte('created_at', sinceStr);
        const { count: apptCount } = await supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('user_id', seller.user_id!).gte('created_at', sinceStr);
        const { count: slaCount } = await supabase.from('sla_alerts').select('id', { count: 'exact', head: true }).eq('assigned_user_id', seller.user_id!).gte('created_at', sinceStr);

        const totalLeads = leadsCount || 0;
        const schedulingRate = totalLeads > 0 ? ((apptCount || 0) / totalLeads) * 100 : 0;
        results.push({ name: seller.name, userId: seller.user_id!, avgFirstResponse: Math.round(avgFirst), avgResponseTime: Math.round(avgResp), schedulingRate: Math.round(schedulingRate), slaAlerts: slaCount || 0, totalLeads, totalDeals: dealsCount || 0 });
      }
      results.sort((a, b) => b.schedulingRate - a.schedulingRate);
      setPerfData(results);
    } catch (err) {
      console.error('Error loading performance:', err);
    } finally {
      setLoadingPerf(false);
    }
  };

  // ── Advanced ──
  const loadAdvanced = async () => {
    setLoadingAdv(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - filterDays);
      const sinceStr = since.toISOString();

      // 1) Contacts for qualification
      let cq = supabase.from('contacts').select('id, source, customer_type, city, neighborhood, interest_services, job_size, has_project, start_timeframe, lead_temperature, lead_score, assigned_user_id').gte('created_at', sinceStr);
      if (filterSeller !== 'all') cq = cq.eq('assigned_user_id', filterSeller);
      const { data: contacts } = await cq.limit(1000);

      const aggregate = (dim: string, arr: any[], getter: (c: any) => string | null) => {
        const map: Record<string, number> = {};
        arr.forEach(c => { const v = getter(c); if (v) map[v] = (map[v] || 0) + 1; });
        return Object.entries(map).map(([value, count]) => ({ dimension: dim, value, count })).sort((a, b) => b.count - a.count);
      };

      const cs = contacts || [];
      const byType = aggregate('tipo_cliente', cs, c => c.customer_type);
      const byCity = aggregate('cidade', cs, c => c.city);
      const byNeighborhood = aggregate('bairro', cs, c => c.neighborhood);
      const byJobSize = aggregate('porte_obra', cs, c => c.job_size);
      const byTimeframe = aggregate('prazo', cs, c => c.start_timeframe);
      const byTemperature = aggregate('temperatura', cs, c => c.lead_temperature);
      const byProject: { dimension: string; value: string; count: number }[] = [];
      let withProject = 0, withoutProject = 0;
      cs.forEach(c => { if (c.has_project === true) withProject++; else if (c.has_project === false) withoutProject++; });
      if (withProject || withoutProject) {
        byProject.push({ dimension: 'projeto', value: 'Com projeto', count: withProject });
        byProject.push({ dimension: 'projeto', value: 'Sem projeto', count: withoutProject });
      }

      const serviceMap: Record<string, number> = {};
      cs.forEach(c => (c.interest_services || []).forEach((s: string) => { serviceMap[s] = (serviceMap[s] || 0) + 1; }));
      const byService = Object.entries(serviceMap).map(([value, count]) => ({ dimension: 'servico', value, count })).sort((a, b) => b.count - a.count);

      const scoreRanges = { '0-40': 0, '41-70': 0, '71-100': 0 };
      cs.forEach(c => {
        const s = c.lead_score || 0;
        if (s <= 40) scoreRanges['0-40']++;
        else if (s <= 70) scoreRanges['41-70']++;
        else scoreRanges['71-100']++;
      });
      const byScoreRange = Object.entries(scoreRanges).map(([value, count]) => ({ dimension: 'score_faixa', value, count }));

      // 2) Objections — combine playbook trigger matching + real conversation_events
      const { data: playbook } = await supabase.from('objections_playbook').select('title, category, triggers').eq('is_active', true);

      let sellerConvIds: Set<string> | null = null;
      if (filterSeller !== 'all') {
        const { data: convs } = await supabase.from('conversations').select('id').eq('assigned_user_id', filterSeller);
        sellerConvIds = new Set((convs || []).map(c => c.id));
      }

      const { data: msgs } = await supabase.from('messages').select('content, conversation_id, sent_at').eq('from_type', 'user').gte('sent_at', sinceStr).order('sent_at', { ascending: false }).limit(2000);

      const filteredMsgs = sellerConvIds ? (msgs || []).filter(m => sellerConvIds!.has(m.conversation_id)) : (msgs || []);

      // Playbook-based matching
      const objectionCounts: Record<string, { title: string; category: string; count: number; triggers: string }> = {};
      (playbook || []).forEach(p => {
        let count = 0;
        const triggerArr = p.triggers || [];
        filteredMsgs.forEach(m => {
          if (!m.content) return;
          const lower = m.content.toLowerCase();
          if (triggerArr.some((t: string) => lower.includes(t.toLowerCase()))) count++;
        });
        if (count > 0 || true) {
          objectionCounts[p.title] = { title: p.title, category: p.category, count, triggers: triggerArr.join(', ') };
        }
      });

      // AI-detected objections from conversation_events
      let evQuery = supabase.from('conversation_events').select('event_data, conversation_id').eq('event_type', 'objection').gte('created_at', sinceStr);
      const { data: objEvents } = await evQuery.limit(500);
      
      const aiObjCounts: Record<string, number> = {};
      (objEvents || []).forEach((ev: any) => {
        if (sellerConvIds && !sellerConvIds.has(ev.conversation_id)) return;
        const cat = ev.event_data?.category;
        if (cat) aiObjCounts[cat] = (aiObjCounts[cat] || 0) + 1;
      });

      // Merge AI-detected into objections list
      const categoryLabels: Record<string, string> = {
        'preco': 'Preço alto', 'prazo': 'Prazo longo', 'concorrente': 'Concorrente',
        'sem_prioridade': 'Sem prioridade', 'sem_projeto': 'Sem projeto',
        'avaliando': 'Ainda avaliando', 'sem_retorno': 'Sem retorno'
      };
      Object.entries(aiObjCounts).forEach(([cat, count]) => {
        const label = categoryLabels[cat] || cat;
        const key = `ai_${cat}`;
        if (objectionCounts[key]) {
          objectionCounts[key].count += count;
        } else {
          objectionCounts[key] = { title: `${label} (IA)`, category: cat, count, triggers: 'detecção automática' };
        }
      });

      const objections = Object.values(objectionCounts).sort((a, b) => b.count - a.count);

      // 3) Funnel
      let dq = supabase.from('deals').select('stage_id, value, user_id, pipeline_stages(title, position)').gte('created_at', sinceStr);
      if (filterSeller !== 'all') dq = dq.eq('user_id', filterSeller);
      const { data: deals } = await dq.limit(1000);

      const stageAgg: Record<string, { stage: string; count: number; total_value: number; position: number }> = {};
      let totalDeals = 0;
      (deals || []).forEach((d: any) => {
        totalDeals++;
        const name = d.pipeline_stages?.title || 'Sem etapa';
        const pos = d.pipeline_stages?.position ?? 999;
        if (!stageAgg[name]) stageAgg[name] = { stage: name, count: 0, total_value: 0, position: pos };
        stageAgg[name].count++;
        stageAgg[name].total_value += Number(d.value) || 0;
      });
      const funnel = Object.values(stageAgg)
        .sort((a, b) => a.position - b.position)
        .map(s => ({ stage: s.stage, count: s.count, total_value: s.total_value, conversion_pct: totalDeals > 0 ? Math.round((s.count / totalDeals) * 100) : 0 }));

      // 4) Seller ranking
      const sellersWithUid = teamMembers.filter(m => m.user_id);
      const ranking: AdvancedData['sellerRanking'] = [];
      for (const s of sellersWithUid) {
        const uid = s.user_id!;
        const leads = cs.filter(c => c.assigned_user_id === uid).length;
        const sellerDeals = (deals || []).filter((d: any) => d.user_id === uid).length;
        const { count: appts } = await supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', sinceStr);
        const { count: sla } = await supabase.from('sla_alerts').select('id', { count: 'exact', head: true }).eq('assigned_user_id', uid).gte('created_at', sinceStr);
        const rate = leads > 0 ? Math.round(((appts || 0) / leads) * 100) : 0;
        ranking.push({ seller: s.name, leads, deals: sellerDeals, appointments: appts || 0, rate, sla: sla || 0 });
      }
      ranking.sort((a, b) => b.rate - a.rate);

      // 5) Sources (Origem dos Leads — para tráfego pago)
      const contactIds = cs.map((c: any) => c.id).filter(Boolean);
      let apptByContact: Record<string, number> = {};
      if (contactIds.length > 0) {
        const { data: appts } = await supabase
          .from('appointments')
          .select('contact_id')
          .in('contact_id', contactIds)
          .gte('created_at', sinceStr)
          .limit(1000);
        (appts || []).forEach((a: any) => {
          if (a.contact_id) apptByContact[a.contact_id] = (apptByContact[a.contact_id] || 0) + 1;
        });
      }
      const sourceAgg: Record<string, { leads: number; qualified: number; appointments: number }> = {};
      cs.forEach((c: any) => {
        const src = (c.source && String(c.source).trim()) || 'Não informado';
        if (!sourceAgg[src]) sourceAgg[src] = { leads: 0, qualified: 0, appointments: 0 };
        sourceAgg[src].leads++;
        if ((c.lead_score || 0) >= 30) sourceAgg[src].qualified++;
        if (apptByContact[c.id]) sourceAgg[src].appointments++;
      });
      const totalLeadsSrc = cs.length;
      const sources = Object.entries(sourceAgg)
        .map(([source, v]) => ({
          source,
          leads: v.leads,
          pct: totalLeadsSrc > 0 ? Math.round((v.leads / totalLeadsSrc) * 100) : 0,
          qualified: v.qualified,
          appointments: v.appointments,
          conversionRate: v.leads > 0 ? Math.round((v.appointments / v.leads) * 100) : 0,
        }))
        .sort((a, b) => b.leads - a.leads);

      setAdvData({
        qualification: { byType, byCity, byNeighborhood, byService, byJobSize, byProject, byTimeframe, byTemperature, byScoreRange },
        objections,
        funnel,
        sellerRanking: ranking,
        sources,
        objectionsSampled: filteredMsgs.length,
      });
    } catch (err) {
      console.error('Error loading advanced:', err);
    } finally {
      setLoadingAdv(false);
    }
  };

  // ── Quality ──
  const loadQuality = async () => {
    setLoadingQuality(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - filterDays);
      const sinceStr = since.toISOString();

      // Total conversations
      let convQ = supabase.from('conversations').select('id, status, assigned_user_id, human_status, created_at, last_message_at').gte('created_at', sinceStr);
      if (filterSeller !== 'all') convQ = convQ.eq('assigned_user_id', filterSeller);
      const { data: convs } = await convQ.limit(1000);
      const totalConversations = (convs || []).length;
      const sentToHuman = (convs || []).filter(c => c.status === 'human').length;
      const resolvedByAI = (convs || []).filter(c => c.status === 'nina').length;
      const unownedHumanConvs = (convs || []).filter(c => c.status === 'human' && !c.assigned_user_id).length;
      const stalledHumanConvs = (convs || []).filter(c => {
        if (c.status !== 'human') return false;
        const lastMsg = new Date(c.last_message_at).getTime();
        return (Date.now() - lastMsg) > 2 * 60 * 60 * 1000; // 2h
      }).length;

      // Qualified leads: has city + customer_type + at least 1 interest_service + lead_score >= 30
      let cq = supabase.from('contacts').select('id, city, customer_type, interest_services, lead_score, qualification_gaps, assigned_user_id').gte('created_at', sinceStr);
      if (filterSeller !== 'all') cq = cq.eq('assigned_user_id', filterSeller);
      const { data: contacts } = await cq.limit(1000);
      const qualifiedLeads = (contacts || []).filter(c => 
        c.city && c.customer_type && (c.interest_services || []).length > 0 && (c.lead_score || 0) >= 30
      ).length;
      const gapsDetected = (contacts || []).filter(c => (c.qualification_gaps as any[] || []).length > 0).length;

      // Follow-up tasks
      let fq = supabase.from('followup_tasks').select('id, status, result, assigned_user_id').gte('created_at', sinceStr);
      if (filterSeller !== 'all') fq = fq.eq('assigned_user_id', filterSeller);
      const { data: followups } = await fq.limit(500);
      const stalledLeads = (followups || []).filter(f => f.status === 'pending').length;
      const completedFollowups = (followups || []).filter(f => f.status === 'completed');
      const successFollowups = completedFollowups.filter(f => f.result === 'retomado' || f.result === 'reagendado');
      const followupSuccessRate = completedFollowups.length > 0 ? Math.round((successFollowups.length / completedFollowups.length) * 100) : 0;

      // Avg time to human (first human msg after conv start)
      const humanConvIds = (convs || []).filter(c => c.status === 'human').map(c => c.id).slice(0, 50);
      let avgTimeToHuman = 0;
      if (humanConvIds.length > 0) {
        const { data: humanMsgs } = await supabase.from('messages').select('conversation_id, sent_at').eq('from_type', 'human').in('conversation_id', humanConvIds).order('sent_at', { ascending: true }).limit(500);
        const convCreatedMap = new Map((convs || []).map(c => [c.id, new Date(c.created_at).getTime()]));
        const firstHumanByConv = new Map<string, number>();
        (humanMsgs || []).forEach(m => {
          if (!firstHumanByConv.has(m.conversation_id)) {
            firstHumanByConv.set(m.conversation_id, new Date(m.sent_at).getTime());
          }
        });
        const diffs: number[] = [];
        firstHumanByConv.forEach((ts, cid) => {
          const created = convCreatedMap.get(cid);
          if (created) diffs.push((ts - created) / 60000);
        });
        avgTimeToHuman = diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0;
      }

      // Conversions by customer type
      let dq = supabase.from('deals').select('won_at, lost_at, user_id, contact:contacts(customer_type)').gte('created_at', sinceStr);
      if (filterSeller !== 'all') dq = dq.eq('user_id', filterSeller);
      const { data: deals } = await dq.limit(1000);
      const typeWon: Record<string, number> = {};
      (deals || []).filter((d: any) => d.won_at).forEach((d: any) => {
        const t = d.contact?.customer_type || 'Não definido';
        typeWon[t] = (typeWon[t] || 0) + 1;
      });
      const conversionsByType = Object.entries(typeWon).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

      // Conversions by seller
      const sellers = teamMembers.filter(m => m.user_id);
      const conversionsBySeller = sellers.map(s => {
        const sellerDeals = (deals || []).filter((d: any) => d.user_id === s.user_id);
        const won = sellerDeals.filter((d: any) => d.won_at).length;
        const lost = sellerDeals.filter((d: any) => d.lost_at).length;
        const rate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;
        return { seller: s.name, won, lost, rate };
      }).filter(s => s.won + s.lost > 0).sort((a, b) => b.rate - a.rate);

      // Events by type
      const { data: events } = await supabase.from('conversation_events').select('event_type').gte('created_at', sinceStr).limit(1000);
      const eventCounts: Record<string, number> = {};
      (events || []).forEach(e => { eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1; });
      const eventsByType = Object.entries(eventCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

      // Funnel drop-off
      const { data: stagesData } = await supabase.from('pipeline_stages').select('id, title, position').eq('is_active', true).order('position', { ascending: true });
      const stageCountMap: Record<string, number> = {};
      (deals || []).forEach((d: any) => { stageCountMap[d.stage_id || ''] = (stageCountMap[d.stage_id || ''] || 0) + 1; });
      const funnelDropoff = (stagesData || []).map((s, i, arr) => {
        const count = stageCountMap[s.id] || 0;
        const prev = i > 0 ? (stageCountMap[arr[i - 1].id] || 0) : count;
        const dropPct = prev > 0 && i > 0 ? Math.round(((prev - count) / prev) * 100) : 0;
        return { stage: s.title, count, dropPct };
      });

      setQualityData({
        totalConversations, qualifiedLeads, sentToHuman, resolvedByAI,
        gapsDetected, stalledLeads, followupSuccessRate, avgTimeToHuman,
        unownedHumanConvs, stalledHumanConvs, conversionsByType, conversionsBySeller,
        funnelDropoff, eventsByType,
      });
    } catch (err) {
      console.error('Error loading quality:', err);
    } finally {
      setLoadingQuality(false);
    }
  };


  const downloadCSV = (filename: string, rows: string[][]) => {
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Cidade', 'Leads'], ...data.byCity.map(c => [c.city, String(c.count)])];
    downloadCSV('relatorio', rows);
  };

  const exportPerfCSV = () => {
    const rows = [
      ['Vendedor', 'Leads', 'Deals', '1ª Resposta (min)', 'Resp. Média (min)', 'Taxa Agend. (%)', 'Alertas SLA'],
      ...perfData.map(p => [p.name, String(p.totalLeads), String(p.totalDeals), String(p.avgFirstResponse), String(p.avgResponseTime), String(p.schedulingRate), String(p.slaAlerts)])
    ];
    downloadCSV('performance', rows);
  };

  const exportQualificationCSV = () => {
    if (!advData) return;
    const q = advData.qualification;
    const all = [...q.byType, ...q.byCity, ...q.byNeighborhood, ...q.byService, ...q.byJobSize, ...q.byProject, ...q.byTimeframe, ...q.byTemperature, ...q.byScoreRange];
    downloadCSV('qualificacao', [['dimension', 'value', 'count'], ...all.map(r => [r.dimension, r.value, String(r.count)])]);
  };

  const exportObjectionsCSV = () => {
    if (!advData) return;
    downloadCSV('objecoes', [['title', 'category', 'count', 'triggers'], ...advData.objections.map(o => [o.title, o.category, String(o.count), `"${o.triggers}"`])]);
  };

  const exportFunnelCSV = () => {
    if (!advData) return;
    downloadCSV('funil', [['stage', 'count', 'total_value', 'conversion_pct'], ...advData.funnel.map(f => [f.stage, String(f.count), String(f.total_value), String(f.conversion_pct)])]);
  };

  const exportRankingCSV = () => {
    if (!advData) return;
    downloadCSV('ranking-vendedores', [['seller', 'leads', 'deals', 'appointments', 'rate', 'sla'], ...advData.sellerRanking.map(r => [r.seller, String(r.leads), String(r.deals), String(r.appointments), String(r.rate), String(r.sla)])]);
  };

  const exportSourcesCSV = () => {
    if (!advData) return;
    downloadCSV('origem-leads', [
      ['canal', 'leads', 'pct_total', 'qualificados', 'agendados', 'taxa_conversao_pct'],
      ...advData.sources.map(s => [s.source, String(s.leads), String(s.pct), String(s.qualified), String(s.appointments), String(s.conversionRate)]),
    ]);
  };

  const handleHeaderCSV = () => {
    if (activeTab === 'performance') exportPerfCSV();
    else if (activeTab === 'advanced') { exportQualificationCSV(); exportFunnelCSV(); }
    else exportCSV();
  };

  const formatMinutes = (min: number) => {
    if (min < 1) return '< 1 min';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const renderQualTable = (title: string, items: { dimension: string; value: string; count: number }[], max = 10) => (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
      <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">{title}</h4>
      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
        {items.slice(0, max).map((item, i) => (
          <div key={i} className="flex justify-between py-1 border-b border-slate-800/50">
            <span className="text-sm text-slate-300 truncate">{item.value}</span>
            <span className="text-xs text-slate-400 font-medium ml-2">{item.count}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center">
            <BarChart3 className="w-8 h-8 text-slate-700 mb-2" />
            <p className="text-xs text-slate-500 font-medium">Ainda não há dados suficientes</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Tente mudar o período ou aguarde mais atendimentos</p>
          </div>
        )}
      </div>
    </div>
  );

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
          <button onClick={handleHeaderCSV} className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/20 transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-800 pb-0">
        <button onClick={() => setActiveTab('overview')} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
          <BarChart3 className="w-4 h-4 inline mr-1.5" />Visão Geral
        </button>
        <button onClick={() => setActiveTab('performance')} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'performance' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
          <Award className="w-4 h-4 inline mr-1.5" />Performance
        </button>
        {isAdmin && (
          <button onClick={() => setActiveTab('advanced')} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'advanced' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
            <Filter className="w-4 h-4 inline mr-1.5" />Avançado
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setActiveTab('quality')} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'quality' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
            <ShieldAlert className="w-4 h-4 inline mr-1.5" />Qualidade
          </button>
        )}
      </div>

      {/* ═══════ OVERVIEW ═══════ */}
      {activeTab === 'overview' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : data && (
            <>
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
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(data.dealsByStage.reduce((s, d) => s + d.value, 0))}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-xs text-slate-500 uppercase">Cidades</p>
                  <p className="text-2xl font-bold text-white mt-1">{data.byCity.length}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-cyan-400" /> Por Etapa</h3>
                  <div className="space-y-2">
                    {data.dealsByStage.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">Ainda não há dados suficientes neste período</p>
                    ) : data.dealsByStage.map(s => (
                      <div key={s.stage} className="flex justify-between items-center py-1.5 border-b border-slate-800/50">
                        <span className="text-sm text-slate-300">{s.stage}</span>
                        <div className="flex gap-3">
                          <span className="text-xs text-slate-500">{s.count} deals</span>
                          <span className="text-xs text-emerald-400 font-medium">{formatCurrency(s.value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-violet-400" /> Por Vendedor</h3>
                  <div className="space-y-2">
                    {data.bySeller.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">Ainda não há dados suficientes neste período</p>
                    ) : data.bySeller.map(s => (
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

      {/* ═══════ PERFORMANCE ═══════ */}
      {activeTab === 'performance' && (
        <>
          {loadingPerf ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="p-5 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" /> Ranking de Vendedores</h3>
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
                        <td className="p-3"><span className={`text-sm font-bold ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-slate-500'}`}>{idx + 1}º</span></td>
                        <td className="p-3 text-sm text-slate-200 font-medium">{p.name}</td>
                        <td className="p-3 text-center text-sm text-slate-300">{p.totalLeads}</td>
                        <td className="p-3 text-center text-sm text-cyan-400">{p.totalDeals}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded ${p.avgFirstResponse <= 10 ? 'bg-emerald-500/10 text-emerald-400' : p.avgFirstResponse <= 30 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                            {p.avgFirstResponse > 0 ? formatMinutes(p.avgFirstResponse) : '—'}
                          </span>
                        </td>
                        <td className="p-3 text-center text-xs text-slate-400">{p.avgResponseTime > 0 ? formatMinutes(p.avgResponseTime) : '—'}</td>
                        <td className="p-3 text-center"><span className={`text-xs font-medium ${p.schedulingRate >= 30 ? 'text-emerald-400' : p.schedulingRate >= 15 ? 'text-amber-400' : 'text-slate-500'}`}>{p.schedulingRate}%</span></td>
                        <td className="p-3 text-center"><span className={`text-xs ${p.slaAlerts > 5 ? 'text-red-400' : p.slaAlerts > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{p.slaAlerts}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {perfData.length === 0 && (
                  <div className="flex flex-col items-center py-12 text-center">
                    <Award className="w-10 h-10 text-slate-700 mb-3" />
                    <p className="text-sm text-slate-500 font-medium">Ainda não há dados de performance</p>
                    <p className="text-xs text-slate-600 mt-1">Os dados aparecerão conforme os vendedores realizarem atendimentos</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {perfData.slice(0, 3).map((p, idx) => (
                  <div key={p.userId} className={`p-4 rounded-xl border ${idx === 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-lg font-bold ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : 'text-orange-400'}`}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
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

      {/* ═══════ ADVANCED (admin-only) ═══════ */}
      {activeTab === 'advanced' && isAdmin && (
        <>
          {loadingAdv ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : advData && (
            <div className="space-y-8">
              {/* ── Bloco A: Qualificação ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> Qualificação do Lead</h3>
                  <button onClick={exportQualificationCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/20 transition-colors">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>

                {/* Score cards */}
                <div className="grid grid-cols-3 gap-3">
                  {advData.qualification.byScoreRange.map(s => (
                    <div key={s.value} className={`p-3 rounded-xl border ${s.value === '71-100' ? 'bg-amber-500/5 border-amber-500/20' : s.value === '41-70' ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-slate-900 border-slate-800'}`}>
                      <p className="text-[10px] text-slate-500 uppercase">Score {s.value}</p>
                      <p className={`text-xl font-bold mt-0.5 ${s.value === '71-100' ? 'text-amber-400' : s.value === '41-70' ? 'text-cyan-400' : 'text-slate-300'}`}>{s.count}</p>
                    </div>
                  ))}
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-3">
                  {advData.qualification.byTemperature.map(t => (
                    <div key={t.value} className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase">{t.value}</p>
                      <p className="text-lg font-bold text-slate-200">{t.count}</p>
                    </div>
                  ))}
                  {advData.qualification.byProject.map(p => (
                    <div key={p.value} className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase">{p.value}</p>
                      <p className="text-lg font-bold text-slate-200">{p.count}</p>
                    </div>
                  ))}
                </div>

                {/* Tables */}
                <div className="grid grid-cols-2 gap-4">
                  {renderQualTable('Top Cidades', advData.qualification.byCity)}
                  {renderQualTable('Top Serviços', advData.qualification.byService)}
                  {renderQualTable('Tipos de Cliente', advData.qualification.byType)}
                  {renderQualTable('Bairros', advData.qualification.byNeighborhood)}
                  {renderQualTable('Porte da Obra', advData.qualification.byJobSize)}
                  {renderQualTable('Prazo de Início', advData.qualification.byTimeframe)}
                </div>
              </div>

              {/* ── Bloco B: Objeções ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-red-400" /> Objeções (ranking)</h3>
                  <button onClick={exportObjectionsCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/20 transition-colors">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
                <p className="text-xs text-slate-500">⚠️ Baseado em amostragem de {advData.objectionsSampled.toLocaleString()} mensagens do período</p>

                <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-800">
                        <th className="text-left p-3 font-medium">#</th>
                        <th className="text-left p-3 font-medium">Objeção</th>
                        <th className="text-left p-3 font-medium">Categoria</th>
                        <th className="text-center p-3 font-medium">Ocorrências</th>
                        <th className="text-left p-3 font-medium">Gatilhos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advData.objections.map((o, i) => (
                        <tr key={o.title} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 text-sm text-slate-500">{i + 1}</td>
                          <td className="p-3 text-sm text-slate-200 font-medium">{o.title}</td>
                          <td className="p-3"><span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 text-slate-400">{o.category}</span></td>
                          <td className="p-3 text-center">
                            <span className={`text-sm font-bold ${o.count > 10 ? 'text-red-400' : o.count > 3 ? 'text-amber-400' : 'text-slate-400'}`}>{o.count}</span>
                          </td>
                          <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">{o.triggers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {advData.objections.length === 0 && (
                    <div className="text-center py-6 px-4 space-y-2">
                      <div className="flex flex-col items-center">
                        <ShieldAlert className="w-8 h-8 text-slate-700 mb-2" />
                        <p className="text-slate-500 text-sm font-medium">Nenhuma objeção detectada ainda</p>
                        <p className="text-xs text-slate-600 mt-1">As objeções serão detectadas automaticamente nas conversas</p>
                      </div>
                      <p className="text-slate-500 text-xs max-w-md mx-auto">O sistema analisa conversas automaticamente (IA + humano) e detecta objeções como preço, prazo, concorrente, falta de projeto, etc. As objeções aparecerão aqui conforme mais conversas forem analisadas. Você também pode cadastrar gatilhos no Playbook de Objeções.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Bloco C: Funil ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-violet-400" /> Funil / Pipeline</h3>
                  <div className="flex gap-2">
                    <button onClick={exportFunnelCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/20 transition-colors">
                      <Download className="w-3.5 h-3.5" /> Funil CSV
                    </button>
                    <button onClick={exportRankingCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/20 transition-colors">
                      <Download className="w-3.5 h-3.5" /> Ranking CSV
                    </button>
                  </div>
                </div>

                {/* Funnel stages */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-800">
                        <th className="text-left p-3 font-medium">Etapa</th>
                        <th className="text-center p-3 font-medium">Deals</th>
                        <th className="text-center p-3 font-medium">Valor Total</th>
                        <th className="text-center p-3 font-medium">% do Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advData.funnel.map(f => (
                        <tr key={f.stage} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 text-sm text-slate-200 font-medium">{f.stage}</td>
                          <td className="p-3 text-center text-sm text-slate-300">{f.count}</td>
                          <td className="p-3 text-center text-sm text-emerald-400">{formatCurrency(f.total_value)}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${f.conversion_pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-400">{f.conversion_pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {advData.funnel.length === 0 && <div className="text-center py-6 text-slate-500 text-sm">Sem deals no período</div>}
                </div>

                {/* Seller ranking */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                  <div className="p-4 border-b border-slate-800">
                    <h4 className="text-sm font-semibold text-slate-300">Ranking de Vendedores</h4>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-800">
                        <th className="text-left p-3 font-medium">Vendedor</th>
                        <th className="text-center p-3 font-medium">Leads</th>
                        <th className="text-center p-3 font-medium">Deals</th>
                        <th className="text-center p-3 font-medium">Agendamentos</th>
                        <th className="text-center p-3 font-medium">Taxa</th>
                        <th className="text-center p-3 font-medium">SLA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advData.sellerRanking.map((r, i) => (
                        <tr key={r.seller} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 text-sm text-slate-200 font-medium">{i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{r.seller}</td>
                          <td className="p-3 text-center text-sm text-slate-300">{r.leads}</td>
                          <td className="p-3 text-center text-sm text-cyan-400">{r.deals}</td>
                          <td className="p-3 text-center text-sm text-slate-300">{r.appointments}</td>
                          <td className="p-3 text-center"><span className={`text-xs font-medium ${r.rate >= 30 ? 'text-emerald-400' : r.rate >= 15 ? 'text-amber-400' : 'text-slate-500'}`}>{r.rate}%</span></td>
                          <td className="p-3 text-center"><span className={`text-xs ${r.sla > 5 ? 'text-red-400' : r.sla > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{r.sla}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════ QUALITY (admin-only) ═══════ */}
      {activeTab === 'quality' && isAdmin && (
        <>
          {loadingQuality ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : qualityData && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Conversas', value: qualityData.totalConversations, color: 'text-white' },
                  { label: 'Leads Qualificados', value: qualityData.qualifiedLeads, color: 'text-emerald-400' },
                  { label: 'Enviadas p/ Humano', value: qualityData.sentToHuman, color: 'text-amber-400' },
                  { label: 'Resolvidas pela IA', value: qualityData.resolvedByAI, color: 'text-cyan-400' },
                  { label: 'Gaps Detectados', value: qualityData.gapsDetected, color: 'text-orange-400' },
                ].map(kpi => (
                  <div key={kpi.label} className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase">{kpi.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Operational Health */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase">Leads Parados</p>
                  <p className={`text-xl font-bold mt-1 ${qualityData.stalledLeads > 5 ? 'text-red-400' : 'text-slate-300'}`}>{qualityData.stalledLeads}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase">Taxa Retomada</p>
                  <p className={`text-xl font-bold mt-1 ${qualityData.followupSuccessRate >= 50 ? 'text-emerald-400' : qualityData.followupSuccessRate >= 25 ? 'text-amber-400' : 'text-red-400'}`}>{qualityData.followupSuccessRate}%</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase">Tempo até Humano</p>
                  <p className="text-xl font-bold text-slate-300 mt-1">{qualityData.avgTimeToHuman > 0 ? formatMinutes(qualityData.avgTimeToHuman) : '—'}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase">Sem Dono (humano)</p>
                  <p className={`text-xl font-bold mt-1 ${qualityData.unownedHumanConvs > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{qualityData.unownedHumanConvs}</p>
                </div>
              </div>

              {/* Stalled human convs alert */}
              {qualityData.stalledHumanConvs > 0 && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300"><strong>{qualityData.stalledHumanConvs}</strong> conversa(s) humana(s) parada(s) há mais de 2h</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                {/* Conversions by Type */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Conversões por Tipo</h3>
                  <div className="space-y-2">
                    {qualityData.conversionsByType.length > 0 ? qualityData.conversionsByType.map(c => (
                      <div key={c.type} className="flex justify-between py-1 border-b border-slate-800/50">
                        <span className="text-sm text-slate-300">{c.type}</span>
                        <span className="text-sm text-emerald-400 font-bold">{c.count}</span>
                      </div>
                    )) : <p className="text-xs text-slate-600">Sem conversões no período</p>}
                  </div>
                </div>

                {/* Funnel Drop-off */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-violet-400" /> Drop-off por Etapa</h3>
                  <div className="space-y-2">
                    {qualityData.funnelDropoff.map(f => (
                      <div key={f.stage} className="flex items-center justify-between py-1 border-b border-slate-800/50">
                        <span className="text-sm text-slate-300">{f.stage}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{f.count} deals</span>
                          {f.dropPct > 0 && (
                            <span className={`text-xs font-medium ${f.dropPct > 50 ? 'text-red-400' : f.dropPct > 25 ? 'text-amber-400' : 'text-slate-400'}`}>
                              ↓{f.dropPct}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Conversions by Seller */}
              {qualityData.conversionsBySeller.length > 0 && (
                <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                  <div className="p-4 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-300">Taxa de Conversão por Vendedor</h3>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase border-b border-slate-800">
                        <th className="text-left p-3">Vendedor</th>
                        <th className="text-center p-3">Ganhos</th>
                        <th className="text-center p-3">Perdidos</th>
                        <th className="text-center p-3">Taxa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualityData.conversionsBySeller.map(s => (
                        <tr key={s.seller} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="p-3 text-sm text-slate-200 font-medium">{s.seller}</td>
                          <td className="p-3 text-center text-sm text-emerald-400">{s.won}</td>
                          <td className="p-3 text-center text-sm text-red-400">{s.lost}</td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold ${s.rate >= 50 ? 'text-emerald-400' : s.rate >= 25 ? 'text-amber-400' : 'text-red-400'}`}>{s.rate}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Events */}
              {qualityData.eventsByType.length > 0 && (
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Eventos Registrados</h3>
                  <div className="flex flex-wrap gap-2">
                    {qualityData.eventsByType.map(e => (
                      <span key={e.type} className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700">
                        {e.type} <strong className="text-cyan-400 ml-1">{e.count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Reports;
