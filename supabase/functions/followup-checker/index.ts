import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  const reqSecret = req.headers.get('x-cron-secret');
  if (cronSecret && reqSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Load settings
    const { data: settings } = await supabase.from('nina_settings').select('business_hours_start, business_hours_end, business_days, auto_followup_enabled, timezone').limit(1).maybeSingle();
    if (!settings) {
      return new Response(JSON.stringify({ message: 'No settings found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    const startHour = parseInt(settings.business_hours_start?.split(':')[0] || '8');
    const endHour = parseInt(settings.business_hours_end?.split(':')[0] || '18');
    const businessDays = settings.business_days || [1,2,3,4,5];
    const isBusinessHours = businessDays.includes(currentDay) && currentHour >= startHour && currentHour < endHour;

    // Find conversations where last client msg has no human reply after it
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, contact_id, assigned_user_id, last_message_at')
      .eq('is_active', true)
      .not('assigned_user_id', 'is', null);

    if (convError) throw convError;

    let created = 0;
    let autoSent = 0;
    let resolved = 0;

    for (const conv of (conversations || [])) {
      // Get last message from client
      const { data: lastClientMsg } = await supabase
        .from('messages')
        .select('sent_at')
        .eq('conversation_id', conv.id)
        .eq('from_type', 'user')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastClientMsg) continue;

      // Get last human response after that
      const { data: lastHumanMsg } = await supabase
        .from('messages')
        .select('sent_at')
        .eq('conversation_id', conv.id)
        .eq('from_type', 'human')
        .gte('sent_at', lastClientMsg.sent_at)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // If human responded, resolve any pending followup
      if (lastHumanMsg) {
        const { count } = await supabase
          .from('followup_tasks')
          .update({ status: 'dismissed', updated_at: new Date().toISOString() })
          .eq('conversation_id', conv.id)
          .eq('status', 'pending')
          .select('id', { count: 'exact', head: true });
        if (count && count > 0) resolved++;
        continue;
      }

      // Calculate inactivity
      const clientMsgTime = new Date(lastClientMsg.sent_at);
      const hoursInactive = (now.getTime() - clientMsgTime.getTime()) / (1000 * 60 * 60);

      if (hoursInactive < 0.17) continue; // Less than 10 min, skip

      // Get contact temperature
      const { data: contact } = await supabase
        .from('contacts')
        .select('lead_temperature, name, call_name')
        .eq('id', conv.contact_id)
        .maybeSingle();

      const temp = contact?.lead_temperature || 'frio';
      const contactName = contact?.call_name || contact?.name || 'cliente';

      let suggested = '';
      let taskTemp = temp;

      if (hoursInactive >= 168) { // 7 days
        suggested = `Olá ${contactName}! Notei que faz um tempinho que conversamos. Tudo bem? Se ainda tiver interesse, estou à disposição para ajudar. 😊`;
        taskTemp = 'frio';
      } else if (hoursInactive >= 48) {
        suggested = `Oi ${contactName}! Passando para saber se conseguiu pensar sobre nosso último contato. Posso ajudar em algo mais?`;
        taskTemp = temp === 'quente' ? 'morno' : 'frio';
      } else if (hoursInactive >= 24) {
        suggested = `Oi ${contactName}! Vi que ainda não tivemos retorno. Gostaria de agendar uma conversa ou tirar alguma dúvida?`;
        taskTemp = temp;
      } else if (hoursInactive >= 0.17) {
        // 10 min+ but < 24h — no followup task yet, skip
        continue;
      }

      if (!suggested) continue;

      // Calculate due_at (if outside business hours, schedule for next business day 9am)
      let dueAt = now;
      if (!isBusinessHours) {
        const next = new Date(now);
        next.setHours(startHour, 0, 0, 0);
        if (currentHour >= endHour || !businessDays.includes(currentDay)) {
          // Move to next business day
          do {
            next.setDate(next.getDate() + 1);
          } while (!businessDays.includes(next.getDay()));
        }
        dueAt = next;
      }

      // Check if pending followup exists (unique index prevents duplicates)
      const { data: existing } = await supabase
        .from('followup_tasks')
        .select('id')
        .eq('conversation_id', conv.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) continue;

      // Insert followup task
      const { error: insertError } = await supabase
        .from('followup_tasks')
        .insert({
          conversation_id: conv.id,
          contact_id: conv.contact_id,
          assigned_user_id: conv.assigned_user_id,
          due_at: dueAt.toISOString(),
          suggested_message: suggested,
          temperature: taskTemp,
        });

      if (insertError) {
        // Unique constraint violation = already exists, skip
        if (insertError.code === '23505') continue;
        console.error('[Followup] Insert error:', insertError);
        continue;
      }

      created++;

      // Auto-send if enabled and within business hours
      if (settings.auto_followup_enabled && isBusinessHours) {
        const { error: queueError } = await supabase.from('send_queue').insert({
          conversation_id: conv.id,
          contact_id: conv.contact_id,
          content: suggested,
          message_type: 'text',
          from_type: 'nina',
          priority: 1,
        });
        if (!queueError) {
          await supabase.from('followup_tasks').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('conversation_id', conv.id).eq('status', 'pending');
          autoSent++;
        }
      }
    }

    console.log(`[Followup] Created: ${created}, Auto-sent: ${autoSent}, Resolved: ${resolved}`);
    return new Response(JSON.stringify({ created, autoSent, resolved }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[Followup] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
