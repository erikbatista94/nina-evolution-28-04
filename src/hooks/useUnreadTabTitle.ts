import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Atualiza o título da aba (document.title) com a contagem de mensagens
 * não lidas (from_type='user' e status != 'read'). Usa realtime para
 * recalcular quando há mudanças em messages.
 */
export function useUnreadTabTitle() {
  const { user } = useAuth();
  const baseTitleRef = useRef<string>(typeof document !== 'undefined' ? document.title : 'GG CRM');

  useEffect(() => {
    if (!user) {
      document.title = baseTitleRef.current;
      return;
    }

    let cancelled = false;

    const computeAndSet = async () => {
      try {
        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('from_type', 'user')
          .neq('status', 'read');

        if (cancelled || error) return;

        const base = baseTitleRef.current.replace(/^\(\d+\)\s*/, '');
        baseTitleRef.current = base;
        document.title = count && count > 0 ? `(${count}) ${base}` : base;
      } catch (e) {
        console.warn('[useUnreadTabTitle] erro ao contar não lidas', e);
      }
    };

    computeAndSet();

    // Realtime: recompute on any message change
    const channel = supabase
      .channel('unread-tab-title')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          // debounce simples
          setTimeout(computeAndSet, 300);
        }
      )
      .subscribe();

    // Polling de segurança a cada 60s
    const interval = setInterval(computeAndSet, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user]);
}
