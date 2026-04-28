import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { phone_number, message } = await req.json();
    if (!phone_number || !message) {
      return new Response(JSON.stringify({ success: false, error: 'Número e mensagem obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanPhone = String(phone_number).replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      return new Response(JSON.stringify({ success: false, error: 'Número inválido (use formato internacional)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Auth check
    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Usuário não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch Evolution credentials
    let { data: settings } = await supabase
      .from('nina_settings')
      .select('evolution_api_url, evolution_api_key, evolution_instance')
      .eq('user_id', userId).maybeSingle();
    if (!settings) {
      const { data } = await supabase
        .from('nina_settings')
        .select('evolution_api_url, evolution_api_key, evolution_instance')
        .is('user_id', null).maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await supabase
        .from('nina_settings')
        .select('evolution_api_url, evolution_api_key, evolution_instance')
        .not('evolution_instance', 'is', null).limit(1).maybeSingle();
      settings = data;
    }

    if (!settings?.evolution_api_url || !settings?.evolution_api_key || !settings?.evolution_instance) {
      return new Response(JSON.stringify({ success: false, error: 'Evolution API não configurada. Acesse Configurações.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send via Evolution
    const base = settings.evolution_api_url.replace(/\/+$/, '');
    const evRes = await fetch(`${base}/message/sendText/${settings.evolution_instance}`, {
      method: 'POST',
      headers: { 'apikey': settings.evolution_api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });
    const evData = await evRes.json();
    if (!evRes.ok) {
      return new Response(JSON.stringify({ success: false, error: evData?.message || 'Erro Evolution', details: evData }), {
        status: evRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: evData?.key?.id || evData?.message?.key?.id || null,
      response: evData,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
