import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Calendar, AlertTriangle, Clock, ExternalLink, Loader2, MessageCircle, RotateCcw, Star, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts } from '@/hooks/useAlerts';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PendingConversation {
  id: string;
  last_message_at: string;
  contact_name: string;
  contact_phone: string;
  is_urgent?: boolean;
}

interface TodayAppointment {
  id: string;
  title: string;
  time: string;
  status: string | null;
  contact_name: string | null;
}

interface FollowupTask {
  id: string;
  conversation_id: string;
  contact_id: string;
  suggested_message: string | null;
  temperature: string | null;
  due_at: string;
  stall_reason: string | null;
  attempt_count: number | null;
  contact_name?: string;
}

interface TopLead {
  id: string;
  name: string | null;
  lead_score: number;
  lead_temperature: string | null;
  city: string | null;
}

interface AwaitingResponse {
  conversation_id: string;
  contact_name: string;
  last_message_at: string;
  hours_waiting: number;
}

const levelConfig = {
  stalled: { label: 'Lead Parado', color: 'bg-red-500/10 border-red-500/30 text-red-400' },
  loss_risk: { label: 'Risco de Perda', color: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
  respond_now: { label: 'Responder Agora', color: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' },
};

const DashboardMyDay: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sdrName } = useCompanySettings();
  const { alerts, loading: alertsLoading } = useAlerts();

  const [conversations, setConversations] = useState<PendingConversation[]>([]);
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [followups, setFollowups] = useState<FollowupTask[]>([]);
  const [topLeads, setTopLeads] = useState<TopLead[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingAppts, setLoadingAppts] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchConversations = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, last_message_at, contacts(name, call_name, phone_number)')
        .eq('assigned_user_id', user.id)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setConversations(data.map((c: any) => ({
          id: c.id,
          last_message_at: c.last_message_at,
          contact_name: c.contacts?.call_name || c.contacts?.name || 'Desconhecido',
          contact_phone: c.contacts?.phone_number || '',
        })));
      }
      setLoadingConvs(false);
    };

    const fetchAppointments = async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('appointments')
        .select('id, title, time, status, contacts(name, call_name)')
        .eq('date', todayStr)
        .eq('user_id', user.id)
        .order('time', { ascending: true });

      if (!error && data) {
        setAppointments(data.map((a: any) => ({
          id: a.id,
          title: a.title,
          time: a.time,
          status: a.status,
          contact_name: a.contacts?.call_name || a.contacts?.name || null,
        })));
      }
      setLoadingAppts(false);
    };

    const fetchFollowups = async () => {
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from('followup_tasks')
        .select('id, conversation_id, contact_id, suggested_message, temperature, due_at, stall_reason, attempt_count')
        .eq('assigned_user_id', user.id)
        .eq('status', 'pending')
        .lte('due_at', todayEnd.toISOString())
        .order('due_at', { ascending: true })
        .limit(10);

      if (data && data.length > 0) {
        // Fetch contact names
        const contactIds = [...new Set(data.map((f: any) => f.contact_id))];
        const { data: contacts } = await supabase.from('contacts').select('id, name, call_name').in('id', contactIds);
        const contactMap = new Map((contacts || []).map((c: any) => [c.id, c.call_name || c.name || 'Desconhecido']));
        setFollowups(data.map((f: any) => ({ ...f, contact_name: contactMap.get(f.contact_id) || 'Desconhecido' })));
      }
    };

    const fetchTopLeads = async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, lead_score, lead_temperature, city')
        .eq('assigned_user_id', user.id)
        .gt('lead_score', 0)
        .order('lead_score', { ascending: false })
        .limit(5);
      setTopLeads((data as TopLead[]) || []);
    };

    fetchConversations();
    fetchAppointments();
    fetchFollowups();
    fetchTopLeads();
  }, [user]);

  const stalledAlerts = alerts.filter(a => a.level === 'stalled');
  const lossRiskAlerts = alerts.filter(a => a.level === 'loss_risk');
  const respondNowAlerts = alerts.filter(a => a.level === 'respond_now');
  const topAlerts = alerts.slice(0, 5);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full bg-background text-foreground custom-scrollbar">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{greeting()} 👋</h2>
        <p className="text-muted-foreground mt-1">Aqui está o resumo do seu dia.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bloco 1 — Conversas Pendentes */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Minhas Conversas Pendentes</h3>
            <span className="ml-auto text-xs text-muted-foreground">{conversations.length}</span>
          </div>

          {loadingConvs ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma conversa pendente 🎉</p>
          ) : (
            <div className="space-y-2">
              {conversations.map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/chat?conversation=${c.id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors text-left group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.contact_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bloco 2 — Agendamentos de Hoje */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-emerald-400" />
            <h3 className="text-lg font-semibold">Agendamentos de Hoje</h3>
            <span className="ml-auto text-xs text-muted-foreground">{appointments.length}</span>
          </div>

          {loadingAppts ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem agendamentos para hoje</p>
          ) : (
            <div className="space-y-2">
              {appointments.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
                  <div className="flex-shrink-0 w-14 text-center">
                    <span className="text-sm font-bold text-emerald-400">{a.time?.slice(0, 5)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    {a.contact_name && <p className="text-xs text-muted-foreground">{a.contact_name}</p>}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground capitalize">{a.status || 'scheduled'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Follow-ups de Hoje */}
      {followups.length > 0 && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <RotateCcw className="h-5 w-5 text-blue-400" />
            <h3 className="text-lg font-semibold">Follow-ups de Hoje</h3>
            <span className="ml-auto text-xs text-muted-foreground">{followups.length}</span>
          </div>
          <div className="space-y-2">
            {followups.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{f.contact_name}</p>
                  {f.stall_reason && (
                    <p className="text-[10px] text-blue-300 mt-0.5">
                      {f.stall_reason === 'sem_retorno' ? '📭 Sem retorno' :
                       f.stall_reason === 'sem_retorno_orcamento' ? '💰 Sem retorno após orçamento' :
                       f.stall_reason === 'aguardando_medidas' ? '📏 Aguardando medidas' :
                       f.stall_reason === 'aguardando_decisao' ? '🤔 Aguardando decisão' :
                       f.stall_reason === 'interesse_sem_avanco' ? '🐌 Interesse sem avanço' :
                       f.stall_reason === 'lead_abandonado' ? '🚫 Lead abandonado' :
                       f.stall_reason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{f.suggested_message?.substring(0, 60)}...</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {f.temperature && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{f.temperature}</span>
                  )}
                  <select
                    defaultValue=""
                    onChange={async (e) => {
                      const result = e.target.value;
                      if (!result) return;
                      await supabase.from('followup_tasks').update({
                        status: 'completed',
                        result,
                        updated_at: new Date().toISOString(),
                        attempt_count: (f as any).attempt_count ? (f as any).attempt_count + 1 : 1,
                      }).eq('id', f.id);
                      setFollowups(prev => prev.filter(x => x.id !== f.id));
                    }}
                    className="text-[10px] bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300 outline-none"
                  >
                    <option value="" disabled>Resultado</option>
                    <option value="retomado">✅ Retomado</option>
                    <option value="sem_resposta">📭 Sem resposta</option>
                    <option value="perdeu_timing">⏰ Perdeu timing</option>
                    <option value="perdido">❌ Perdido</option>
                    <option value="reagendado">📅 Reagendado</option>
                  </select>
                  <button
                    onClick={() => navigate(`/chat?conversation=${f.conversation_id}&suggested=${encodeURIComponent(f.suggested_message || '')}`)}
                    className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <MessageCircle className="h-3 w-3" /> Abrir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Leads by Score */}
      {topLeads.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-5 w-5 text-amber-400" />
            <h3 className="text-lg font-semibold">Top Leads</h3>
          </div>
          <div className="space-y-2">
            {topLeads.map((lead, i) => (
              <div key={lead.id} className="flex items-center gap-3 p-2 rounded-lg bg-amber-500/5">
                <span className="text-lg font-bold text-amber-400 w-6 text-center">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{lead.name || 'Sem nome'}</p>
                  <p className="text-xs text-muted-foreground">{lead.city || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${lead.lead_temperature === 'quente' ? 'bg-red-500/10 text-red-400' : lead.lead_temperature === 'morno' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {lead.lead_temperature || 'frio'}
                  </span>
                  <span className="text-sm font-bold text-amber-400">{lead.lead_score}pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bloco 3 — Leads em Risco (SLA) */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-orange-400" />
          <h3 className="text-lg font-semibold">Leads em Risco</h3>
          <span className="ml-auto text-xs text-muted-foreground">{alerts.length} alerta{alerts.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Level summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {([['stalled', stalledAlerts], ['loss_risk', lossRiskAlerts], ['respond_now', respondNowAlerts]] as const).map(([level, arr]) => (
            <div key={level} className={`rounded-xl border p-3 text-center ${levelConfig[level].color}`}>
              <p className="text-2xl font-bold">{arr.length}</p>
              <p className="text-[11px] font-medium">{levelConfig[level].label}</p>
            </div>
          ))}
        </div>

        {alertsLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : topAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">Nenhum alerta ativo 🎉</p>
        ) : (
          <div className="space-y-2">
            {topAlerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{alert.contact_name}</p>
                  <p className="text-xs text-muted-foreground">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {formatDistanceToNow(new Date(alert.last_client_message_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${levelConfig[alert.level].color}`}>
                    {levelConfig[alert.level].label}
                  </span>
                  {alert.suggested_message && (
                    <button
                      onClick={() => navigate(`/chat?conversation=${alert.conversation_id}&suggested=${encodeURIComponent(alert.suggested_message!)}`)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      title="Inserir follow-up"
                    >
                      <MessageCircle className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/chat?conversation=${alert.conversation_id}`)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="Abrir conversa"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardMyDay;
