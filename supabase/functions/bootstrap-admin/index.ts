import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, password, name, secret } = body;

    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret || secret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'email and password required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if user exists
    const { data: existing } = await admin.auth.admin.listUsers();
    let userId: string | null = existing?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;

    if (userId) {
      // Update password
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: name || 'Admin' },
      });
      if (updErr) {
        return new Response(JSON.stringify({ error: 'update failed: ' + updErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name || 'Admin' },
      });
      if (cErr || !created.user) {
        return new Response(JSON.stringify({ error: 'create failed: ' + (cErr?.message || 'unknown') }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = created.user.id;
    }

    // Wait for trigger
    await new Promise(r => setTimeout(r, 600));

    // Force admin role
    await admin.from('user_roles').delete().eq('user_id', userId);
    await admin.from('user_roles').insert({ user_id: userId, role: 'admin' });

    // Disable force_password_change so user logs in straight
    await admin.from('profiles').update({
      force_password_change: false,
      full_name: name || 'Admin',
    }).eq('user_id', userId);

    return new Response(JSON.stringify({ success: true, user_id: userId, email }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});