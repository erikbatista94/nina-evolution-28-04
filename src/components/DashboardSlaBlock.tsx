import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { useAlerts } from '@/hooks/useAlerts';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const levelConfig = {
  stalled: { label: 'Lead Parado', color: 'bg-red-500/10 border-red-500/30 text-red-400' },
  loss_risk: { label: 'Risco de Perda', color: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
  respond_now: { label: 'Responder Agora', color: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' },
};

const DashboardSlaBlock: React.FC = () => {
  const navigate = useNavigate();
  const { alerts, loading } = useAlerts();

  const stalledCount = alerts.filter(a => a.level === 'stalled').length;
  const lossRiskCount = alerts.filter(a => a.level === 'loss_risk').length;
  const respondNowCount = alerts.filter(a => a.level === 'respond_now').length;
  const topAlerts = alerts.slice(0, 10);

  if (loading || alerts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
      <div className="flex items-center gap-2 mb-5">
        <AlertTriangle className="h-5 w-5 text-orange-400" />
        <h3 className="text-lg font-semibold">Leads em Risco (SLA)</h3>
        <span className="ml-auto text-sm text-muted-foreground">{alerts.length} alerta{alerts.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {([['stalled', stalledCount], ['loss_risk', lossRiskCount], ['respond_now', respondNowCount]] as const).map(([level, count]) => (
          <div key={level} className={`rounded-xl border p-3 text-center ${levelConfig[level].color}`}>
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-[11px] font-medium">{levelConfig[level].label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {topAlerts.map(alert => (
          <button
            key={alert.id}
            onClick={() => navigate(`/chat?conversation=${alert.conversation_id}`)}
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors text-left group"
          >
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
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default DashboardSlaBlock;
