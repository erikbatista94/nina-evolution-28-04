import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { url, apiKey, instance } = await req.json();
    if (!url || !apiKey || !instance) {
      return new Response(JSON.stringify({ ok: false, error: 'url, apiKey and instance required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base = url.replace(/\/+$/, '');
    const headers = { 'apikey': apiKey, 'Content-Type': 'application/json' };

    // 1. Try to fetch existing instance state
    const stateRes = await fetch(`${base}/instance/connectionState/${instance}`, { headers });
    let alreadyConnected = false;
    if (stateRes.ok) {
      const s = await stateRes.json();
      const st = s?.instance?.state || s?.state;
      if (st === 'open') alreadyConnected = true;
    }

    if (alreadyConnected) {
      return new Response(JSON.stringify({ ok: true, connected: true, message: 'Instância já conectada' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Create instance if not exists
    if (stateRes.status === 404) {
      const createRes = await fetch(`${base}/instance/create`, {
        method: 'POST', headers,
        body: JSON.stringify({
          instanceName: instance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });
      const createData = await createRes.json();
      const qrBase64 = createData?.qrcode?.base64 || createData?.qrcode?.qrcode || createData?.base64;
      if (qrBase64) {
        return new Response(JSON.stringify({ ok: true, qrcode: qrBase64, created: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: 'Falha ao criar instância', details: createData }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Existing instance - request a fresh QR
    const connectRes = await fetch(`${base}/instance/connect/${instance}`, { headers });
    const connectData = await connectRes.json();
    const qr = connectData?.base64 || connectData?.qrcode?.base64 || connectData?.code;
    return new Response(JSON.stringify({ ok: true, qrcode: qr || null, raw: connectData }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
