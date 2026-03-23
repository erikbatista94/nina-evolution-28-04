import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SlaAlert {
  id: string;
  conversation_id: string;
  contact_id: string;
  assigned_user_id: string | null;
  level: 'respond_now' | 'loss_risk' | 'stalled';
  resolved: boolean;
  resolved_at: string | null;
  suggested_message: string | null;
  last_client_message_at: string;
  created_at: string;
  updated_at: string;
  // joined
  contact_name?: string;
  contact_phone?: string;
}

const levelPriority = { stalled: 3, loss_risk: 2, respond_now: 1 };

export function useAlerts() {
  const [alerts, setAlerts] = useState<SlaAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from('sla_alerts')
      .select('*, contacts(name, call_name, phone_number)')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[useAlerts] fetch error:', error.message);
      return;
    }

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      contact_id: row.contact_id,
      assigned_user_id: row.assigned_user_id,
      level: row.level,
      resolved: row.resolved,
      resolved_at: row.resolved_at,
      suggested_message: row.suggested_message,
      last_client_message_at: row.last_client_message_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      contact_name: row.contacts?.call_name || row.contacts?.name || 'Desconhecido',
      contact_phone: row.contacts?.phone_number,
    }));

    mapped.sort((a: SlaAlert, b: SlaAlert) => (levelPriority[b.level] || 0) - (levelPriority[a.level] || 0));
    setAlerts(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel('sla-alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sla_alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAlerts]);

  const resolveAlert = useCallback(async (alertId: string) => {
    const { error } = await supabase
      .from('sla_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() } as any)
      .eq('id', alertId);

    if (error) {
      console.error('[useAlerts] resolve error:', error.message);
      return false;
    }
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    return true;
  }, []);

  const alertCount = alerts.length;
  const hasStalled = alerts.some(a => a.level === 'stalled');
  const hasLossRisk = alerts.some(a => a.level === 'loss_risk');

  return { alerts, alertCount, loading, resolveAlert, hasStalled, hasLossRisk, refetch: fetchAlerts };
}
