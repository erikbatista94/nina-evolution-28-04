import React, { useMemo } from 'react';
import { useAlerts, SlaAlert } from '@/hooks/useAlerts';
import { useNavigate } from 'react-router-dom';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { Bell, Clock, AlertTriangle, XCircle, MessageSquare, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const levelConfig = {
  respond_now: {
    label: 'Responder agora',
    color: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    badgeColor: 'bg-yellow-500',
    icon: Clock,
  },
  loss_risk: {
    label: 'Risco de perda',
    color: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    badgeColor: 'bg-orange-500',
    icon: AlertTriangle,
  },
  stalled: {
    label: 'Lead parado',
    color: 'bg-red-500/10 border-red-500/30 text-red-400',
    badgeColor: 'bg-red-500',
    icon: XCircle,
  },
};

const AlertCard: React.FC<{ alert: SlaAlert; onOpenChat: (id: string) => void; onResolve: (id: string) => void }> = ({
  alert,
  onOpenChat,
  onResolve,
}) => {
  const config = levelConfig[alert.level];
  const Icon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(alert.last_client_message_at), { addSuffix: true, locale: ptBR });

  return (
    <div className={`rounded-xl border p-4 ${config.color} transition-all hover:scale-[1.01]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg ${config.badgeColor}/20 flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{alert.contact_name}</p>
            <p className="text-xs opacity-70 mt-0.5">{config.label} · Sem resposta {timeAgo}</p>
            {alert.contact_phone && <p className="text-xs opacity-50 mt-0.5">{alert.contact_phone}</p>}
          </div>
        </div>
      </div>

      {alert.suggested_message && (
        <div className="mt-3 p-2.5 rounded-lg bg-background/30 border border-border/30">
          <p className="text-xs opacity-60 mb-1">Mensagem sugerida:</p>
          <p className="text-xs italic">"{alert.suggested_message}"</p>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => onOpenChat(alert.conversation_id)}>
          <ExternalLink className="w-3 h-3 mr-1" />
          Abrir Chat
        </Button>
        {alert.suggested_message && (
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => onOpenChat(alert.conversation_id)}>
            <MessageSquare className="w-3 h-3 mr-1" />
            Follow-up
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 text-xs px-2 opacity-60 hover:opacity-100" onClick={() => onResolve(alert.id)}>
          Resolver
        </Button>
      </div>
    </div>
  );
};

const AlertsPanel: React.FC = () => {
  const { alerts, alertCount, loading, resolveAlert } = useAlerts();
  const { isAdmin } = useCompanySettings();
  const navigate = useNavigate();

  const handleOpenChat = (conversationId: string) => {
    navigate(`/chat?conversation=${conversationId}`);
  };

  const grouped = useMemo(() => {
    return {
      stalled: alerts.filter(a => a.level === 'stalled'),
      loss_risk: alerts.filter(a => a.level === 'loss_risk'),
      respond_now: alerts.filter(a => a.level === 'respond_now'),
    };
  }, [alerts]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Alertas de SLA</h1>
            <p className="text-sm text-muted-foreground">
              {alertCount === 0 ? 'Nenhum alerta pendente' : `${alertCount} alerta${alertCount > 1 ? 's' : ''} pendente${alertCount > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {alertCount === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Tudo em dia! 🎉</p>
            <p className="text-sm mt-1">Nenhuma conversa aguardando resposta.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.stalled.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-red-400 mb-3 uppercase tracking-wider">
                  Lead Parado ({grouped.stalled.length})
                </h2>
                <div className="space-y-3">
                  {grouped.stalled.map(a => (
                    <AlertCard key={a.id} alert={a} onOpenChat={handleOpenChat} onResolve={resolveAlert} />
                  ))}
                </div>
              </section>
            )}

            {grouped.loss_risk.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-orange-400 mb-3 uppercase tracking-wider">
                  Risco de Perda ({grouped.loss_risk.length})
                </h2>
                <div className="space-y-3">
                  {grouped.loss_risk.map(a => (
                    <AlertCard key={a.id} alert={a} onOpenChat={handleOpenChat} onResolve={resolveAlert} />
                  ))}
                </div>
              </section>
            )}

            {grouped.respond_now.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-yellow-400 mb-3 uppercase tracking-wider">
                  Responder Agora ({grouped.respond_now.length})
                </h2>
                <div className="space-y-3">
                  {grouped.respond_now.map(a => (
                    <AlertCard key={a.id} alert={a} onOpenChat={handleOpenChat} onResolve={resolveAlert} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertsPanel;
