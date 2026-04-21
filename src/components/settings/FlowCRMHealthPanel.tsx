import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, UserX, Clock } from 'lucide-react';

interface SyncEvent {
  id: string;
  created_at: string;
  contact_id: string | null;
  conversation_id: string | null;
  event_data: any;
  contact?: { name: string | null; phone_number: string } | null;
}

interface Stats {
  total24h: number;
  success24h: number;
  failed24h: number;
  noSeller24h: number;
  leadCount: number;
  qualifCount: number;
  successRate: number;
}

const FlowCRMHealthPanel: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentFailures, setRecentFailures] = useState<SyncEvent[]>([]);
  const [recentEvents, setRecentEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const { data: events24h } = await supabase
      .from('conversation_events')
      .select('id, created_at, contact_id, conversation_id, event_data')
      .eq('event_type', 'flowcrm_sync')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    const list = (events24h ?? []) as SyncEvent[];

    let success = 0;
    let failed = 0;
    let noSeller = 0;
    let leadCount = 0;
    let qualifCount = 0;
    for (const ev of list) {
      const ed = ev.event_data ?? {};
      if (ed.skipped) continue;
      if (ed.success === true) success++;
      else failed++;
      if (ed.has_seller === false) noSeller++;
      if (ed.event === 'lead') leadCount++;
      if (ed.event === 'qualification') qualifCount++;
    }
    const totalAttempts = success + failed;
    const successRate = totalAttempts > 0 ? Math.round((success / totalAttempts) * 100) : 0;

    setStats({
      total24h: totalAttempts,
      success24h: success,
      failed24h: failed,
      noSeller24h: noSeller,
      leadCount,
      qualifCount,
      successRate,
    });

    // Recent failures (last 10)
    const failures = list.filter((e) => e.event_data?.success === false && !e.event_data?.skipped).slice(0, 10);

    // Recent events (last 15, including success)
    const recent = list.filter((e) => !e.event_data?.skipped).slice(0, 15);

    // Hydrate contact names
    const allIds = Array.from(new Set([...failures, ...recent].map((e) => e.contact_id).filter(Boolean))) as string[];
    if (allIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, phone_number')
        .in('id', allIds);
      const cmap = new Map((contacts ?? []).map((c) => [c.id, c]));
      failures.forEach((e) => { if (e.contact_id) e.contact = cmap.get(e.contact_id) as any; });
      recent.forEach((e) => { if (e.contact_id) e.contact = cmap.get(e.contact_id) as any; });
    }

    setRecentFailures(failures);
    setRecentEvents(recent);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: refresh on new event
  useEffect(() => {
    const channel = supabase
      .channel('flowcrm-health-panel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_events', filter: 'event_type=eq.flowcrm_sync' },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Saúde da Integração FlowCRM
          </h3>
          <p className="text-sm text-slate-400 mt-1">Monitoramento dos eventos das últimas 24 horas. Atualiza em tempo real.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-slate-700 hover:bg-slate-800 text-slate-300 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Taxa de sucesso (24h)"
          value={`${stats?.successRate ?? 0}%`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone={stats && stats.successRate >= 90 ? 'success' : stats && stats.successRate >= 60 ? 'warning' : 'danger'}
          subtitle={`${stats?.success24h ?? 0} de ${stats?.total24h ?? 0} tentativas`}
        />
        <KpiCard
          label="Falhas (24h)"
          value={String(stats?.failed24h ?? 0)}
          icon={<XCircle className="w-4 h-4" />}
          tone={stats && stats.failed24h > 0 ? 'danger' : 'neutral'}
        />
        <KpiCard
          label="Sem vendedor"
          value={String(stats?.noSeller24h ?? 0)}
          icon={<UserX className="w-4 h-4" />}
          tone={stats && stats.noSeller24h > 0 ? 'warning' : 'neutral'}
          subtitle="Eventos sem dono atribuído"
        />
        <KpiCard
          label="Leads / Qualif."
          value={`${stats?.leadCount ?? 0} / ${stats?.qualifCount ?? 0}`}
          icon={<Activity className="w-4 h-4" />}
          tone="neutral"
        />
      </div>

      {/* Recent failures */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <h4 className="text-sm font-semibold text-white">Últimas falhas</h4>
          <span className="text-xs text-slate-500">({recentFailures.length})</span>
        </div>
        {recentFailures.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">Nenhuma falha registrada nas últimas 24h. ✨</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentFailures.map((e) => {
              const ed = e.event_data ?? {};
              return (
                <div key={e.id} className="px-4 py-3 text-sm flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-rose-400 font-mono text-xs">HTTP {ed.http_status ?? '—'}</span>
                      <span className="text-slate-300 truncate">
                        {ed.event === 'qualification' ? 'Qualificação' : 'Lead'} · {e.contact?.name || e.contact?.phone_number || 'Contato desconhecido'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {ed.error ? String(ed.error).slice(0, 200) : 'Sem mensagem de erro'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {formatTime(e.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent events log */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h4 className="text-sm font-semibold text-white">Eventos recentes</h4>
        </div>
        {recentEvents.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">Nenhum evento nas últimas 24h.</div>
        ) : (
          <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto custom-scrollbar">
            {recentEvents.map((e) => {
              const ed = e.event_data ?? {};
              const ok = ed.success === true;
              return (
                <div key={e.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                    <span className="text-slate-300 truncate">
                      <span className="text-slate-500">{ed.event === 'qualification' ? 'Qualif.' : 'Lead'}</span>
                      {' · '}
                      {e.contact?.name || e.contact?.phone_number || '—'}
                      {ed.seller_name && <span className="text-slate-500"> · vendedor: {ed.seller_name}</span>}
                      {!ed.has_seller && <span className="text-amber-400 text-xs ml-2">[sem vendedor]</span>}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 shrink-0">{formatTime(e.created_at)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  subtitle?: string;
}> = ({ label, value, icon, tone, subtitle }) => {
  const toneClass = {
    success: 'border-emerald-500/30 text-emerald-400',
    warning: 'border-amber-500/30 text-amber-400',
    danger: 'border-rose-500/30 text-rose-400',
    neutral: 'border-slate-700 text-slate-300',
  }[tone];
  return (
    <div className={`rounded-xl border bg-slate-900/50 p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
};

export default FlowCRMHealthPanel;
