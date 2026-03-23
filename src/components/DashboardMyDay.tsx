import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Calendar, AlertTriangle, Clock, ExternalLink, Loader2, MessageCircle } from 'lucide-react';
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
}

interface TodayAppointment {
  id: string;
  title: string;
  time: string;
  status: string | null;
  contact_name: string | null;
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

    fetchConversations();
    fetchAppointments();
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
