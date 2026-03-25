import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const storagePath = url.searchParams.get('path');
    const messageId = url.searchParams.get('message_id');
    const bucket = url.searchParams.get('bucket') || 'whatsapp-media';

    if (!storagePath && !messageId) {
      return new Response(JSON.stringify({ error: 'path or message_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Support JWT from Authorization header OR ?token= query param (for <img>/<video>/<audio> tags)
    let authHeader = req.headers.get('Authorization');
    const tokenParam = url.searchParams.get('token');
    if (!authHeader && tokenParam) {
      authHeader = `Bearer ${tokenParam}`;
    }

    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: provide Authorization header or ?token= param' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user with anon client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = claimsData.claims.sub as string;

    // Service role client for storage access
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = !!roleData;

    let resolvedPath = storagePath;
    let conversationId: string | null = null;

    // If message_id provided, resolve path from message
    if (messageId && !resolvedPath) {
      const { data: msg } = await supabase
        .from('messages')
        .select('media_url, metadata, conversation_id')
        .eq('id', messageId)
        .maybeSingle();

      if (!msg) {
        return new Response(JSON.stringify({ error: 'Message not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      conversationId = msg.conversation_id;
      const meta = msg.metadata as any;
      resolvedPath = meta?.storage_path || null;

      if (!resolvedPath && msg.media_url) {
        // Try to extract path from URL
        const parts = msg.media_url.split('/object/public/whatsapp-media/');
        if (parts.length >= 2) {
          resolvedPath = decodeURIComponent(parts[1]);
        }
      }

      if (!resolvedPath) {
        return new Response(JSON.stringify({ error: 'No storage path found for message' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Permission check: non-admin must have conversation assigned to them
    if (!isAdmin) {
      // Get conversation_id from path or message
      if (!conversationId && resolvedPath) {
        // Try to find the message that uses this media_url
        const { data: msgs } = await supabase
          .from('messages')
          .select('conversation_id')
          .or(`media_url.ilike.%${resolvedPath}%,metadata->>storage_path.eq.${resolvedPath}`)
          .limit(1);

        if (msgs && msgs.length > 0) {
          conversationId = msgs[0].conversation_id;
        }
      }

      if (conversationId) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('assigned_user_id')
          .eq('id', conversationId)
          .maybeSingle();

        if (conv && conv.assigned_user_id !== userId) {
          return new Response(JSON.stringify({ error: 'Forbidden: conversation not assigned to you' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Download from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(resolvedPath!);

    if (downloadError || !fileData) {
      console.error('[media-proxy] Download error:', downloadError);
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Determine content type from extension
    const ext = resolvedPath!.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp',
      'gif': 'image/gif', 'mp4': 'video/mp4', '3gp': 'video/3gpp',
      'ogg': 'audio/ogg', 'mp3': 'audio/mpeg', 'aac': 'audio/aac', 'webm': 'audio/webm',
      'pdf': 'application/pdf', 'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    // For documents, use attachment disposition; for media, use inline
    const isDocument = ['pdf', 'doc', 'docx'].includes(ext);
    const disposition = isDocument ? `attachment; filename="${resolvedPath!.split('/').pop()}"` : 'inline';

    return new Response(fileData, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[media-proxy] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
