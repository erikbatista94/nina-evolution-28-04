import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function generateTempPassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let password = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) password += chars[array[i] % chars.length];
  return password;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET');

    const body = await req.json().catch(() => ({}));
    const { email, new_password } = body as { email?: string; new_password?: string };

    if (!email || typeof email !== 'string') {
      return json({ error: 'email is required' }, 400);
    }
    if (new_password && (typeof new_password !== 'string' || new_password.length < 8)) {
      return json({ error: 'new_password must be at least 8 chars' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorize: either CRON_SECRET header, or caller must be super_admin
    const providedSecret = req.headers.get('x-cron-secret');
    let authorized = false;
    let authorizedAs: 'cron' | 'super_admin' | null = null;
    let actorId: string | null = null;

    if (cronSecret && providedSecret && providedSecret === cronSecret) {
      authorized = true;
      authorizedAs = 'cron';
    } else {
      const authHeader = req.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: claims } = await userClient.auth.getUser();
        if (claims?.user) {
          actorId = claims.user.id;
          const { data: role } = await admin
            .from('user_roles')
            .select('role')
            .eq('user_id', claims.user.id)
            .maybeSingle();
          if (role && (role as any).role === 'super_admin') {
            authorized = true;
            authorizedAs = 'super_admin';
          }
        }
      }
    }

    if (!authorized) return json({ error: 'Forbidden' }, 403);

    // Find user by email
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return json({ error: listErr.message }, 500);
    const target = list.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!target) return json({ error: 'User not found' }, 404);

    const password = new_password || generateTempPassword();

    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, { password });
    if (updErr) return json({ error: updErr.message }, 500);

    await admin
      .from('profiles')
      .update({ force_password_change: true })
      .eq('user_id', target.id);

    console.log(
      JSON.stringify({
        event: 'admin_reset_password',
        target_user_id: target.id,
        target_email: email,
        actor_id: actorId,
        authorized_as: authorizedAs,
        generated: !new_password,
      }),
    );

    return json({
      success: true,
      user_id: target.id,
      email,
      temporary_password: new_password ? undefined : password,
      force_password_change: true,
    });
  } catch (e) {
    console.error('admin-reset-password error', e);
    return json({ error: 'Internal error' }, 500);
  }
});