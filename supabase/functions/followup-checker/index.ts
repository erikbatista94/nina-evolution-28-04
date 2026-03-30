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

  const cronSecret = Deno.env.get('CRON_SECRET');
  const reqSecret = req.headers.get('x-cron-secret');
  if (cronSecret && reqSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
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

    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, contact_id, assigned_user_id, last_message_at, status')
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
        .select('sent_at, content')
        .eq('conversation_id', conv.id)
        .eq('from_type', 'user')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastClientMsg) continue;

      // Get last human/nina response after that
      const { data: lastResponse } = await supabase
        .from('messages')
        .select('sent_at, from_type')
        .eq('conversation_id', conv.id)
        .in('from_type', ['human', 'nina'])
        .gte('sent_at', lastClientMsg.sent_at)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // If responded, resolve pending followups
      if (lastResponse) {
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

      if (hoursInactive < 24) continue; // Only create followups after 24h

      // Get contact info
      const { data: contact } = await supabase
        .from('contacts')
        .select('lead_temperature, name, call_name, lead_status')
        .eq('id', conv.contact_id)
        .maybeSingle();

      const temp = contact?.lead_temperature || 'frio';
      const contactName = contact?.call_name || contact?.name || 'cliente';

      // Determine stall reason
      let stallReason = 'sem_retorno';
      const lastMsgLower = (lastClientMsg.content || '').toLowerCase();
      
      // Check deal status for context
      const { data: deal } = await supabase
        .from('deals')
        .select('proposal_status, stage')
        .eq('contact_id', conv.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (deal?.proposal_status === 'sent') {
        stallReason = 'sem_retorno_orcamento';
      } else if (lastMsgLower.includes('medida') || lastMsgLower.includes('medir') || lastMsgLower.includes('metragem')) {
        stallReason = 'aguardando_medidas';
      } else if (lastMsgLower.includes('vou pensar') || lastMsgLower.includes('preciso conversar') || lastMsgLower.includes('vou avaliar')) {
        stallReason = 'aguardando_decisao';
      } else if (hoursInactive >= 168) {
        stallReason = 'lead_abandonado';
      } else if (hoursInactive >= 48) {
        stallReason = 'interesse_sem_avanco';
      }

      // Build suggested message based on stall reason
      let suggested = '';
      const stallMessages: Record<string, string> = {
        'sem_retorno_orcamento': `Oi ${contactName}! 😊 Passando para saber se conseguiu analisar o orçamento que enviamos. Alguma dúvida ou ajuste que eu possa ajudar?`,
        'aguardando_medidas': `Oi ${contactName}! Vi que ficamos aguardando as medidas do local. Tudo certo por aí? Se precisar de ajuda para medir, posso agendar uma visita técnica! 📏`,
        'aguardando_decisao': `Oi ${contactName}! Tudo bem? Passando para saber se teve alguma novidade sobre o projeto. Estou à disposição para qualquer dúvida! 😊`,
        'interesse_sem_avanco': `Oi ${contactName}! Passando para saber se ainda tem interesse no projeto. Posso ajudar em algo mais?`,
        'lead_abandonado': `Olá ${contactName}! Faz um tempinho que conversamos. Tudo bem? Se ainda tiver interesse, estou à disposição. 😊`,
        'sem_retorno': `Oi ${contactName}! Vi que ainda não tivemos retorno. Gostaria de agendar uma conversa ou tirar alguma dúvida?`
      };
      suggested = stallMessages[stallReason] || stallMessages['sem_retorno'];

      // Calculate due_at
      let dueAt = now;
      if (!isBusinessHours) {
        const next = new Date(now);
        next.setHours(startHour, 0, 0, 0);
        if (currentHour >= endHour || !businessDays.includes(currentDay)) {
          do {
            next.setDate(next.getDate() + 1);
          } while (!businessDays.includes(next.getDay()));
        }
        dueAt = next;
      }

      // Check existing pending followup
      const { data: existing } = await supabase
        .from('followup_tasks')
        .select('id, attempt_count')
        .eq('conversation_id', conv.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) {
        // Update existing with new stall reason if changed
        await supabase.from('followup_tasks')
          .update({ 
            stall_reason: stallReason,
            suggested_message: suggested,
            temperature: temp,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        continue;
      }

      // Insert followup task
      const { error: insertError } = await supabase
        .from('followup_tasks')
        .insert({
          conversation_id: conv.id,
          contact_id: conv.contact_id,
          assigned_user_id: conv.assigned_user_id,
          due_at: dueAt.toISOString(),
          suggested_message: suggested,
          temperature: temp,
          stall_reason: stallReason,
          attempt_count: 0,
          history: [],
        });

      if (insertError) {
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
          await supabase.from('followup_tasks')
            .update({ status: 'sent', updated_at: new Date().toISOString(), attempt_count: 1 })
            .eq('conversation_id', conv.id).eq('status', 'pending');
          autoSent++;
        }
      }

      // Log conversation event
      try {
        await supabase.from('conversation_events').insert({
          conversation_id: conv.id,
          contact_id: conv.contact_id,
          event_type: 'stalled',
          event_data: { stall_reason: stallReason, hours_inactive: Math.round(hoursInactive), temperature: temp }
        });
      } catch (e) { /* non-critical */ }
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
