import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function generateTempPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let password = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify requester is admin using their token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !claimsData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const requesterId = claimsData.user.id;

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if requester is admin
    const { data: isAdmin } = await adminClient.rpc('has_role', { _user_id: requesterId, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse body
    const body = await req.json();
    const { name, email, role, team_id, function_id, weight, whatsapp_number, status } = body;

    if (!name || !email) {
      return new Response(JSON.stringify({ error: 'name and email are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate temp password
    const temporaryPassword = generateTempPassword();

    // Create user via Admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const newUserId = newUser.user.id;

    // Set force_password_change on profile (trigger handle_new_user already created profiles entry)
    // Small delay to allow trigger to execute
    await new Promise(resolve => setTimeout(resolve, 500));

    await adminClient
      .from('profiles')
      .update({ force_password_change: true })
      .eq('user_id', newUserId);

    // Map role to app_role: admin -> admin, manager/agent -> user
    const appRole = role === 'admin' ? 'admin' : 'user';
    
    // Update user_roles if role differs from default ('user')
    if (appRole === 'admin') {
      await adminClient
        .from('user_roles')
        .update({ role: 'admin' })
        .eq('user_id', newUserId);
    }

    // Map role to member_role enum
    const memberRole = role === 'admin' ? 'admin' : role === 'manager' ? 'manager' : 'agent';

    // Create team_members entry
    const teamMemberData: Record<string, any> = {
      user_id: newUserId,
      name,
      email,
      role: memberRole,
      status: status || 'active',
      weight: weight || 1,
    };

    if (team_id) teamMemberData.team_id = team_id;
    if (function_id) teamMemberData.function_id = function_id;
    if (whatsapp_number) teamMemberData.whatsapp_number = whatsapp_number;

    const { error: memberError } = await adminClient
      .from('team_members')
      .insert(teamMemberData);

    if (memberError) {
      console.error('Error creating team member:', memberError);
      // User was created but team member failed - still return success with warning
      return new Response(JSON.stringify({ 
        success: true, 
        user_id: newUserId, 
        temporary_password: temporaryPassword,
        warning: 'User created but team_members entry failed: ' + memberError.message
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: newUserId, 
      temporary_password: temporaryPassword 
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
