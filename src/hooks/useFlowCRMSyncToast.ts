import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Global listener: shows a toast whenever a flowcrm_sync event is logged.
 * Mounted once at app level.
 */
export function useFlowCRMSyncToast() {
  useEffect(() => {
    const channel = supabase
      .channel('flowcrm-sync-toasts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_events', filter: 'event_type=eq.flowcrm_sync' },
        (payload) => {
          const ed = (payload.new as any)?.event_data ?? {};
          const event = ed.event === 'qualification' ? 'Qualificação' : 'Lead';
          if (ed.success === true) {
            toast.success(`✓ ${event} sincronizado com FlowCRM`, {
              description: ed.seller_name ? `Vendedor: ${ed.seller_name}` : undefined,
              duration: 3000,
            });
          } else if (ed.skipped) {
            // silent — dedup skip is not interesting to the user
          } else {
            toast.error(`⚠ Falha ao sincronizar ${event} no FlowCRM`, {
              description: ed.error ? String(ed.error).slice(0, 120) : `HTTP ${ed.http_status ?? '—'}`,
              duration: 5000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
