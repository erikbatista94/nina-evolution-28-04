import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('[sla-checker] Starting SLA check...');

    // 1. Find conversations with unanswered client messages (status = 'human' means assigned to human)
    const { data: pending, error: queryError } = await supabase.rpc('execute_sla_query' as any);

    // Since we can't use RPC for ad-hoc queries, use raw approach via REST
    // Query conversations where last client message has no subsequent human reply
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, contact_id, assigned_user_id, status, is_active')
      .eq('is_active', true);

    if (convError) {
      throw new Error(`Failed to fetch conversations: ${convError.message}`);
    }

    console.log(`[sla-checker] Found ${conversations?.length || 0} active conversations`);

    let alertsCreated = 0;
    let alertsResolved = 0;

    for (const conv of conversations || []) {
      // Get last client message and last human message timestamps
      const { data: lastClientMsg } = await supabase
        .from('messages')
        .select('sent_at')
        .eq('conversation_id', conv.id)
        .eq('from_type', 'user')
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      if (!lastClientMsg) continue;

      const { data: lastHumanMsg } = await supabase
        .from('messages')
        .select('sent_at')
        .eq('conversation_id', conv.id)
        .eq('from_type', 'human')
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      const lastClientAt = new Date(lastClientMsg.sent_at);
      const lastHumanAt = lastHumanMsg ? new Date(lastHumanMsg.sent_at) : new Date('1970-01-01');

      // If human replied after client's last message, auto-resolve any open alerts
      if (lastHumanAt > lastClientAt) {
        const { data: resolved } = await supabase
          .from('sla_alerts')
          .update({ resolved: true, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('conversation_id', conv.id)
          .eq('resolved', false)
          .select('id');

        if (resolved?.length) {
          alertsResolved += resolved.length;
          console.log(`[sla-checker] Resolved ${resolved.length} alerts for conversation ${conv.id}`);
        }
        continue;
      }

      // Calculate minutes since last client message
      const diffMs = Date.now() - lastClientAt.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes < 10) continue;

      // Get contact name for suggested message
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, call_name')
        .eq('id', conv.contact_id)
        .single();

      const contactName = contact?.call_name || contact?.name || 'cliente';

      // Determine levels to create
      const levels: { level: string; suggestedMessage: string | null }[] = [];

      if (diffMinutes >= 1440) {
        levels.push({
          level: 'stalled',
          suggestedMessage: `Olá ${contactName}, tudo bem? Vi que ficamos sem falar. Posso ajudar em algo?`,
        });
        levels.push({ level: 'loss_risk', suggestedMessage: null });
        levels.push({ level: 'respond_now', suggestedMessage: null });
      } else if (diffMinutes >= 120) {
        levels.push({ level: 'loss_risk', suggestedMessage: null });
        levels.push({ level: 'respond_now', suggestedMessage: null });
      } else {
        levels.push({ level: 'respond_now', suggestedMessage: null });
      }

      for (const { level, suggestedMessage } of levels) {
        // Check if open alert already exists (partial unique index workaround)
        const { data: existing } = await supabase
          .from('sla_alerts')
          .select('id')
          .eq('conversation_id', conv.id)
          .eq('level', level)
          .eq('resolved', false)
          .maybeSingle();

        if (existing) {
          // Update existing alert
          await supabase
            .from('sla_alerts')
            .update({
              last_client_message_at: lastClientMsg.sent_at,
              suggested_message: suggestedMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          console.log(`[sla-checker] Updated existing alert: ${conv.id} / ${level}`);
        } else {
          // Insert new alert
          const { error: insertError } = await supabase
            .from('sla_alerts')
            .insert({
              conversation_id: conv.id,
              contact_id: conv.contact_id,
              assigned_user_id: conv.assigned_user_id,
              level,
              resolved: false,
              suggested_message: suggestedMessage,
              last_client_message_at: lastClientMsg.sent_at,
              updated_at: new Date().toISOString(),
            });

          if (insertError) {
            console.error(`[sla-checker] Insert error for ${conv.id}/${level}:`, insertError.message);
          } else {
            alertsCreated++;
          }
        }
      }
    }

    console.log(`[sla-checker] Done. Created/updated: ${alertsCreated}, Resolved: ${alertsResolved}`);

    return new Response(
      JSON.stringify({ success: true, alertsCreated, alertsResolved }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sla-checker] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
