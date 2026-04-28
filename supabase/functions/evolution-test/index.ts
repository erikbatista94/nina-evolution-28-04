import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { url, apiKey, instance } = await req.json();
    if (!url || !apiKey) {
      return new Response(JSON.stringify({ ok: false, error: 'url and apiKey required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base = url.replace(/\/+$/, '');
    const headers = { 'apikey': apiKey, 'Content-Type': 'application/json' };

    // 1. Ping the Evolution root
    const rootRes = await fetch(base, { headers });
    const rootText = await rootRes.text();
    if (!rootRes.ok) {
      return new Response(JSON.stringify({
        ok: false, error: `Cannot reach Evolution API (${rootRes.status})`,
        details: rootText.substring(0, 200),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let instanceState: string | null = null;
    let instanceFound = false;

    // 2. If instance provided, check connection state
    if (instance) {
      const stateRes = await fetch(`${base}/instance/connectionState/${instance}`, { headers });
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        instanceFound = true;
        instanceState = stateData?.instance?.state || stateData?.state || 'unknown';
      } else if (stateRes.status === 404) {
        instanceFound = false;
      }
    }

    // Persist last check
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await supabase.from('nina_settings').update({
      evolution_last_check: new Date().toISOString(),
      evolution_connection_status: instanceState === 'open' ? 'connected' : (instanceState || 'disconnected'),
    }).is('user_id', null);

    return new Response(JSON.stringify({
      ok: true,
      reachable: true,
      instance_found: instanceFound,
      instance_state: instanceState,
      connected: instanceState === 'open',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
