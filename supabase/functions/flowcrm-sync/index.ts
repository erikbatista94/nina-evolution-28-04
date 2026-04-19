import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FLOWCRM_LEAD_URL = 'https://yyqygaibsnazummwfbau.supabase.co/functions/v1/nina-lead';
const FLOWCRM_QUALIFICATION_URL = 'https://yyqygaibsnazummwfbau.supabase.co/functions/v1/nina-qualification';
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, opts: RequestInit, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Always respond 200 — never break the caller
  const respondOk = (body: any = { ok: true }) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { event, contact_id, conversation_id } = await req.json();

    if (!event || !contact_id) {
      return respondOk({ ok: false, error: 'Missing event or contact_id' });
    }

    const token = Deno.env.get('FLOWCRM_TOKEN');
    if (!token) {
      console.error('[FlowCRM] FLOWCRM_TOKEN not configured');
      return respondOk({ ok: false, error: 'FLOWCRM_TOKEN missing' });
    }

    // Load contact
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('id, name, call_name, phone_number, city, source, customer_type, job_size, interest_services, notes, client_memory, assigned_user_id')
      .eq('id', contact_id)
      .maybeSingle();

    if (contactErr || !contact) {
      console.error('[FlowCRM] Contact not found:', contact_id, contactErr);
      return respondOk({ ok: false, error: 'contact not found' });
    }

    // === RESOLVE SELLER (vendedor responsável) ===
    // Priority: conversation.assigned_user_id → contact.assigned_user_id → client_memory.assigned_user_id
    let sellerUserId: string | null = null;

    if (conversation_id) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('assigned_user_id')
        .eq('id', conversation_id)
        .maybeSingle();
      if (conv?.assigned_user_id) sellerUserId = conv.assigned_user_id;
    }

    if (!sellerUserId && contact.assigned_user_id) {
      sellerUserId = contact.assigned_user_id;
    }

    if (!sellerUserId) {
      const memSeller = (contact.client_memory as any)?.assigned_user_id
        ?? (contact.client_memory as any)?.seller?.user_id;
      if (memSeller) sellerUserId = memSeller;
    }

    let sellerName: string | null = null;
    let sellerEmail: string | null = null;
    let sellerId: string | null = null; // team_members.id

    if (sellerUserId) {
      // Prefer team_members (has whatsapp/google email + name)
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name, email, google_calendar_email')
        .eq('user_id', sellerUserId)
        .maybeSingle();

      if (tm) {
        sellerId = tm.id;
        sellerName = tm.name || null;
        sellerEmail = tm.google_calendar_email || tm.email || null;
      }

      // Fallback to profiles for name if missing
      if (!sellerName) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', sellerUserId)
          .maybeSingle();
        if (prof?.full_name) sellerName = prof.full_name;
      }

      // Fallback to auth.users for email if missing
      if (!sellerEmail) {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(sellerUserId);
          if (authUser?.user?.email) sellerEmail = authUser.user.email;
        } catch (e) {
          console.warn('[FlowCRM] Could not fetch auth user email:', e);
        }
      }
    }

    const hasSeller = !!(sellerName || sellerEmail || sellerId);
    console.log(`[FlowCRM] Seller resolved: name=${sellerName} email=${sellerEmail} id=${sellerId} hasSeller=${hasSeller}`);

    // === DEDUPLICATION FOR LEAD EVENT ===
    if (event === 'lead') {
      // Check if a successful lead sync already happened for this contact
      const { data: existingLead } = await supabase
        .from('conversation_events')
        .select('id')
        .eq('contact_id', contact_id)
        .eq('event_type', 'flowcrm_sync')
        .eq('event_data->>event', 'lead')
        .eq('event_data->>success', 'true')
        .limit(1)
        .maybeSingle();

      if (existingLead) {
        console.log('[FlowCRM] Lead already synced for contact', contact_id, '— skipping');
        return respondOk({ ok: true, skipped: 'already_synced' });
      }
    }

    // === DEDUPLICATION FOR QUALIFICATION EVENT ===
    if (event === 'qualification') {
      const memory = (contact.client_memory ?? {}) as Record<string, any>;
      if (memory.flowcrm_qualified_at) {
        console.log('[FlowCRM] Qualification already synced for contact', contact_id, '— skipping');
        return respondOk({ ok: true, skipped: 'already_qualified' });
      }
    }

    // Build payload
    const phone = contact.phone_number;
    const nome = contact.name || contact.call_name || 'Lead WhatsApp';

    let url: string;
    let payload: Record<string, any>;

    if (event === 'lead') {
      url = FLOWCRM_LEAD_URL;
      payload = {
        nome,
        telefone: phone,
        cidade: contact.city || null,
        origem: contact.source || 'WhatsApp',
        status_atendimento: 'novo_lead',
      };
    } else if (event === 'qualification') {
      url = FLOWCRM_QUALIFICATION_URL;
      const memory = (contact.client_memory ?? {}) as Record<string, any>;
      const painPoints = memory?.sales_intelligence?.pain_points;
      const observacoesParts: string[] = [];
      if (contact.notes) observacoesParts.push(contact.notes);
      if (Array.isArray(painPoints) && painPoints.length > 0) {
        observacoesParts.push('Dores: ' + painPoints.join('; '));
      }

      payload = {
        telefone: phone,
        nome,
        cidade: contact.city || null,
        tipo_cliente: contact.customer_type || null,
        natureza_obra: contact.job_size || null,
        categoria_servico: Array.isArray(contact.interest_services)
          ? contact.interest_services.join(', ')
          : null,
        observacoes: observacoesParts.join(' | ') || null,
        status_atendimento: 'qualificado',
      };

      // Include handoff_humano if present in memory
      const handoff = memory?.handoff_humano ?? memory?.lead_profile?.handoff_humano;
      if (handoff !== undefined && handoff !== null) {
        payload.handoff_humano = handoff;
      }
    } else {
      return respondOk({ ok: false, error: `Unknown event: ${event}` });
    }

    // Add seller fields to both events when available
    if (sellerName) payload.seller_name = sellerName;
    if (sellerEmail) payload.seller_email = sellerEmail;
    if (sellerId) payload.seller_id = sellerId;

    // Fire request
    let httpStatus: number | null = null;
    let success = false;
    let errorSnippet: string | null = null;

    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      httpStatus = res.status;
      const responseText = await res.text();

      if (res.ok) {
        success = true;
        console.log(`[FlowCRM] ✅ ${event} synced for ${phone} (HTTP ${res.status})`);
      } else {
        errorSnippet = responseText.substring(0, 300);
        console.warn(`[FlowCRM] ⚠️ ${event} failed (HTTP ${res.status}): ${errorSnippet}`);
      }
    } catch (err: any) {
      errorSnippet = (err?.message || String(err)).substring(0, 300);
      console.error(`[FlowCRM] ❌ ${event} fetch error:`, errorSnippet);
    }

    // Log to conversation_events for debugging
    try {
      await supabase.from('conversation_events').insert({
        conversation_id: conversation_id || null,
        contact_id,
        event_type: 'flowcrm_sync',
        event_data: {
          event,
          endpoint: url,
          http_status: httpStatus,
          success,
          error: errorSnippet,
          phone,
          seller_name: sellerName,
          seller_email: sellerEmail,
          seller_id: sellerId,
          has_seller: hasSeller,
        },
      });
    } catch (logErr) {
      console.error('[FlowCRM] Event log error:', logErr);
    }

    // Mark qualification flag on success
    if (success && event === 'qualification') {
      try {
        const memory = (contact.client_memory ?? {}) as Record<string, any>;
        const updated = { ...memory, flowcrm_qualified_at: new Date().toISOString() };
        await supabase.from('contacts').update({ client_memory: updated }).eq('id', contact_id);
      } catch (mErr) {
        console.error('[FlowCRM] Memory flag update error:', mErr);
      }
    }

    return respondOk({ ok: true, success, http_status: httpStatus });
  } catch (error: any) {
    console.error('[FlowCRM] Handler error:', error);
    return respondOk({ ok: false, error: error?.message || 'unknown' });
  }
});
