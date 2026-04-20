import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FlowCRMSyncStatus = 'synced' | 'pending' | 'error' | 'stale';

export interface ContactSyncInfo {
  status: FlowCRMSyncStatus;
  lastSyncAt: string | null;
  lastEvent: string | null;
  httpStatus: number | null;
}

const STALE_HOURS = 24;

function computeStatus(success: boolean, syncedAt: string | null): FlowCRMSyncStatus {
  if (!syncedAt) return 'pending';
  if (!success) return 'error';
  const ageMs = Date.now() - new Date(syncedAt).getTime();
  return ageMs > STALE_HOURS * 3600 * 1000 ? 'stale' : 'synced';
}

/**
 * Loads the latest flowcrm_sync event per contact for the given list of contact IDs.
 * Subscribes to realtime to keep statuses fresh.
 */
export function useFlowCRMSyncStatuses(contactIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, ContactSyncInfo>>({});

  const load = useCallback(async () => {
    if (contactIds.length === 0) {
      setStatuses({});
      return;
    }
    const { data, error } = await supabase
      .from('conversation_events')
      .select('contact_id, event_data, created_at')
      .eq('event_type', 'flowcrm_sync')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data) return;

    const map: Record<string, ContactSyncInfo> = {};
    for (const row of data) {
      const cid = row.contact_id as string | null;
      if (!cid || map[cid]) continue; // first row per contact = latest
      const ed = (row.event_data ?? {}) as any;
      const success = ed.success === true;
      map[cid] = {
        status: computeStatus(success, row.created_at),
        lastSyncAt: row.created_at,
        lastEvent: ed.event ?? null,
        httpStatus: ed.http_status ?? null,
      };
    }
    setStatuses(map);
  }, [contactIds.join(',')]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (contactIds.length === 0) return;
    const channel = supabase
      .channel('flowcrm-sync-statuses')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_events', filter: 'event_type=eq.flowcrm_sync' },
        (payload) => {
          const row: any = payload.new;
          if (!row?.contact_id || !contactIds.includes(row.contact_id)) return;
          const ed = (row.event_data ?? {}) as any;
          const success = ed.success === true;
          setStatuses((prev) => ({
            ...prev,
            [row.contact_id]: {
              status: computeStatus(success, row.created_at),
              lastSyncAt: row.created_at,
              lastEvent: ed.event ?? null,
              httpStatus: ed.http_status ?? null,
            },
          }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactIds.join(',')]);

  return statuses;
}
