import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normaliza phone para o formato Evolution: somente dígitos + @s.whatsapp.net
function toJid(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function evoUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

async function evoPost(settings: any, path: string, body: any) {
  const res = await fetch(evoUrl(settings.evolution_api_url, path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': settings.evolution_api_key,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    console.error('[Sender] Evolution error', res.status, data);
    throw new Error(data?.message || data?.error || `Evolution API ${res.status}`);
  }
  return data;
}

async function fetchMediaAsBase64(supabase: any, mediaUrl: string, storagePath?: string): Promise<{ base64: string; mimeType: string }> {
  let resolvedPath = storagePath;
  if (!resolvedPath && mediaUrl?.includes('/object/public/whatsapp-media/')) {
    resolvedPath = decodeURIComponent(mediaUrl.split('/object/public/whatsapp-media/')[1]);
  }

  let bytes: Uint8Array;
  let mimeType = 'application/octet-stream';

  if (resolvedPath) {
    const { data, error } = await supabase.storage.from('whatsapp-media').download(resolvedPath);
    if (error || !data) throw new Error(`Storage download failed: ${error?.message || 'no data'}`);
    bytes = new Uint8Array(await data.arrayBuffer());
    mimeType = (data as Blob).type || mimeType;
  } else {
    const r = await fetch(mediaUrl);
    if (!r.ok) throw new Error(`Failed to fetch media: ${r.status}`);
    bytes = new Uint8Array(await r.arrayBuffer());
    mimeType = r.headers.get('content-type') || mimeType;
  }

  // Convert to base64 in chunks to avoid stack overflow
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as any);
  }
  return { base64: btoa(binary), mimeType };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Sender] Starting Evolution send process...');

    const MAX_EXECUTION_TIME = 25000;
    const startTime = Date.now();
    let totalSent = 0;
    let iterations = 0;
    const settingsCache: Record<string, any> = {};

    while (Date.now() - startTime < MAX_EXECUTION_TIME) {
      iterations++;

      const { data: queueItems, error: claimError } = await supabase
        .rpc('claim_send_queue_batch', { p_limit: 10 });

      if (claimError) throw claimError;

      if (!queueItems || queueItems.length === 0) {
        const { data: upcoming } = await supabase
          .from('send_queue')
          .select('id, scheduled_at')
          .eq('status', 'pending')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', new Date(Date.now() + 5000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (upcoming && upcoming.length > 0) {
          const waitTime = Math.min(
            Math.max(new Date(upcoming[0].scheduled_at).getTime() - Date.now() + 100, 0),
            5000
          );
          if (waitTime > 0 && (Date.now() - startTime + waitTime) < MAX_EXECUTION_TIME) {
            await new Promise(r => setTimeout(r, waitTime));
            continue;
          }
        }
        break;
      }

      for (const item of queueItems) {
        try {
          const { data: conversation } = await supabase
            .from('conversations')
            .select('user_id')
            .eq('id', item.conversation_id)
            .single();

          if (!conversation) throw new Error('Conversation not found');
          const userId = conversation.user_id;

          const cacheKey = userId || 'global';
          let settings = settingsCache[cacheKey];
          if (!settings) {
            let settingsData = null;
            if (userId) {
              const { data } = await supabase
                .from('nina_settings')
                .select('evolution_api_url, evolution_api_key, evolution_instance')
                .eq('user_id', userId)
                .maybeSingle();
              settingsData = data;
            }
            if (!settingsData) {
              const { data } = await supabase
                .from('nina_settings')
                .select('evolution_api_url, evolution_api_key, evolution_instance')
                .is('user_id', null)
                .maybeSingle();
              settingsData = data;
            }
            if (!settingsData) {
              const { data } = await supabase
                .from('nina_settings')
                .select('evolution_api_url, evolution_api_key, evolution_instance')
                .not('evolution_instance', 'is', null)
                .limit(1)
                .maybeSingle();
              settingsData = data;
            }
            if (!settingsData?.evolution_api_url || !settingsData?.evolution_api_key || !settingsData?.evolution_instance) {
              throw new Error('Evolution API not configured');
            }
            settings = settingsData;
            settingsCache[cacheKey] = settings;
          }

          await sendMessage(supabase, settings, item);

          await supabase
            .from('send_queue')
            .update({ status: 'completed', sent_at: new Date().toISOString() })
            .eq('id', item.id);

          totalSent++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Sender] Error sending ${item.id}:`, errorMessage);
          const newRetryCount = (item.retry_count || 0) + 1;
          const shouldRetry = newRetryCount < 3;
          await supabase
            .from('send_queue')
            .update({
              status: shouldRetry ? 'pending' : 'failed',
              retry_count: newRetryCount,
              error_message: errorMessage,
              scheduled_at: shouldRetry
                ? new Date(Date.now() + newRetryCount * 60000).toISOString()
                : null,
            })
            .eq('id', item.id);
        }
      }
    }

    return new Response(JSON.stringify({ sent: totalSent, iterations, executionTime: Date.now() - startTime }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function resolveAgentName(supabase: any, senderUserId: string): Promise<string | null> {
  const { data: member } = await supabase
    .from('team_members')
    .select('name')
    .eq('user_id', senderUserId)
    .eq('status', 'active')
    .maybeSingle();
  if (member?.name) return member.name;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', senderUserId)
    .maybeSingle();
  return profile?.full_name || null;
}

async function sendMessage(supabase: any, settings: any, queueItem: any) {
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, whatsapp_id')
    .eq('id', queueItem.contact_id)
    .maybeSingle();
  if (!contact) throw new Error('Contact not found');

  const number = (contact.whatsapp_id || contact.phone_number || '').replace(/\D/g, '');
  if (!number) throw new Error('Contact has no phone number');

  // Agent name prefix for human messages
  let finalContent = queueItem.content || '';
  if (queueItem.from_type === 'human' && queueItem.message_id) {
    const { data: msgRecord } = await supabase
      .from('messages')
      .select('sender_user_id')
      .eq('id', queueItem.message_id)
      .maybeSingle();
    if (msgRecord?.sender_user_id) {
      const agentName = await resolveAgentName(supabase, msgRecord.sender_user_id);
      if (agentName && finalContent && !finalContent.startsWith(`${agentName}:`) && !finalContent.startsWith(`*${agentName}:*`)) {
        finalContent = `*${agentName}:* ${finalContent}`;
      }
    }
  }

  const instance = settings.evolution_instance;
  let waMessageId: string | undefined;

  switch (queueItem.message_type) {
    case 'text': {
      const resp = await evoPost(settings, `/message/sendText/${instance}`, {
        number,
        text: finalContent,
      });
      waMessageId = resp?.key?.id || resp?.message?.key?.id;
      break;
    }
    case 'image':
    case 'video':
    case 'document': {
      const meta = (queueItem.metadata as any) || {};
      const { base64, mimeType } = await fetchMediaAsBase64(supabase, queueItem.media_url, meta.storage_path);
      const mediatype = queueItem.message_type;
      const fileName = meta.filename ||
        (mediatype === 'image' ? 'image.jpg' :
         mediatype === 'video' ? 'video.mp4' : 'document.pdf');
      const resp = await evoPost(settings, `/message/sendMedia/${instance}`, {
        number,
        mediatype,
        mimetype: meta.mime_type || mimeType,
        media: base64,
        fileName,
        caption: finalContent?.trim() || undefined,
      });
      waMessageId = resp?.key?.id || resp?.message?.key?.id;
      break;
    }
    case 'audio': {
      const meta = (queueItem.metadata as any) || {};
      const { base64 } = await fetchMediaAsBase64(supabase, queueItem.media_url, meta.storage_path);
      const resp = await evoPost(settings, `/message/sendWhatsAppAudio/${instance}`, {
        number,
        audio: base64,
        encoding: true,
      });
      waMessageId = resp?.key?.id || resp?.message?.key?.id;
      break;
    }
    default: {
      const resp = await evoPost(settings, `/message/sendText/${instance}`, {
        number,
        text: finalContent,
      });
      waMessageId = resp?.key?.id || resp?.message?.key?.id;
    }
  }

  if (queueItem.message_id) {
    const updateData: any = {
      whatsapp_message_id: waMessageId,
      status: 'sent',
      sent_at: new Date().toISOString(),
    };
    if (finalContent !== queueItem.content) {
      updateData.metadata = { ...(queueItem.metadata || {}), outgoing_text: finalContent };
    }
    await supabase.from('messages').update(updateData).eq('id', queueItem.message_id);
  } else {
    await supabase.from('messages').insert({
      conversation_id: queueItem.conversation_id,
      whatsapp_message_id: waMessageId,
      content: queueItem.content,
      type: queueItem.message_type,
      from_type: queueItem.from_type,
      status: 'sent',
      media_url: queueItem.media_url || null,
      sent_at: new Date().toISOString(),
      metadata: queueItem.metadata || {},
    });
  }

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', queueItem.conversation_id);
}
