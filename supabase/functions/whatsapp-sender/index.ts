import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_URL = "https://graph.facebook.com/v19.0";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Sender] Starting send process...');

    const MAX_EXECUTION_TIME = 25000; // 25 seconds
    const startTime = Date.now();
    let totalSent = 0;
    let iterations = 0;

    console.log('[Sender] Starting polling loop');

    // Cache de settings por user_id para evitar múltiplas queries
    const settingsCache: Record<string, any> = {};

    while (Date.now() - startTime < MAX_EXECUTION_TIME) {
      iterations++;
      console.log(`[Sender] Iteration ${iterations}, elapsed: ${Date.now() - startTime}ms`);

      // Claim batch of messages to send
      const { data: queueItems, error: claimError } = await supabase
        .rpc('claim_send_queue_batch', { p_limit: 10 });

      if (claimError) {
        console.error('[Sender] Error claiming batch:', claimError);
        throw claimError;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('[Sender] No messages ready to send, checking for scheduled messages...');
        
        // Check for messages scheduled in the next 5 seconds
        const { data: upcoming, error: upcomingError } = await supabase
          .from('send_queue')
          .select('id, scheduled_at')
          .eq('status', 'pending')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', new Date(Date.now() + 5000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (upcomingError) {
          console.error('[Sender] Error checking upcoming messages:', upcomingError);
        }

        if (upcoming && upcoming.length > 0) {
          const scheduledAt = new Date(upcoming[0].scheduled_at).getTime();
          const now = Date.now();
          const waitTime = Math.min(
            Math.max(scheduledAt - now + 100, 0),
            5000
          );
          
          if (waitTime > 0 && (Date.now() - startTime + waitTime) < MAX_EXECUTION_TIME) {
            console.log(`[Sender] Waiting ${waitTime}ms for scheduled message at ${upcoming[0].scheduled_at}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        // No more messages to process
        console.log('[Sender] No more messages to process, exiting loop');
        break;
      }

      console.log(`[Sender] Processing batch of ${queueItems.length} messages`);

      for (const item of queueItems) {
        try {
          // Buscar user_id da conversation para multi-tenancy
          const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('user_id')
            .eq('id', item.conversation_id)
            .single();

          if (convError || !conversation) {
            console.error(`[Sender] Error fetching conversation ${item.conversation_id}:`, convError);
            throw new Error('Conversation not found');
          }

          const userId = conversation.user_id;
          
          // Buscar settings do cache ou do banco com fallback triplo
          const cacheKey = userId || 'global';
          let settings = settingsCache[cacheKey];
          if (!settings) {
            let settingsData = null;

            // 1. Tentar por user_id da conversa
            if (userId) {
              const { data } = await supabase
                .from('nina_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .eq('user_id', userId)
                .maybeSingle();
              settingsData = data;
            }

            // 2. Fallback: buscar global (user_id IS NULL)
            if (!settingsData) {
              console.log('[Sender] No user-specific settings, trying global...');
              const { data } = await supabase
                .from('nina_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .is('user_id', null)
                .maybeSingle();
              settingsData = data;
            }

            // 3. Último fallback: qualquer settings com WhatsApp configurado
            if (!settingsData) {
              console.log('[Sender] No global settings, fetching any with WhatsApp...');
              const { data } = await supabase
                .from('nina_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .not('whatsapp_phone_number_id', 'is', null)
                .limit(1)
                .maybeSingle();
              settingsData = data;
            }

            if (!settingsData) {
              console.error('[Sender] No settings found with any fallback');
              throw new Error('Settings not found');
            }

            if (!settingsData.whatsapp_access_token || !settingsData.whatsapp_phone_number_id) {
              console.error('[Sender] WhatsApp not configured in settings');
              throw new Error('WhatsApp not configured');
            }

            settings = settingsData;
            settingsCache[cacheKey] = settings;
          }

          await sendMessage(supabase, settings, item);
          
          // Mark as completed
          await supabase
            .from('send_queue')
            .update({ 
              status: 'completed', 
              sent_at: new Date().toISOString() 
            })
            .eq('id', item.id);
          
          totalSent++;
          console.log(`[Sender] Successfully sent message ${item.id} (${totalSent} total)`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Sender] Error sending item ${item.id}:`, error);
          
          // Mark as failed with retry
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
                : null
            })
            .eq('id', item.id);
        }
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`[Sender] Completed: sent ${totalSent} messages in ${iterations} iterations (${executionTime}ms)`);

    return new Response(JSON.stringify({ 
      sent: totalSent, 
      iterations,
      executionTime 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Sender] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

async function uploadMediaToWhatsApp(
  settings: any, supabase: any, mediaUrl: string, mimeType: string
): Promise<string> {
  // 1. Parse storage path from the public URL
  const parts = mediaUrl.split('/object/public/whatsapp-media/');
  if (parts.length < 2) {
    throw new Error(`Cannot parse storage path from media URL: ${mediaUrl}`);
  }
  const storagePath = decodeURIComponent(parts[1]);
  console.log(`[Sender] Downloading from Storage: ${storagePath}`);

  // 2. Download from Storage (service role bypasses RLS)
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('whatsapp-media')
    .download(storagePath);

  if (downloadError || !fileData) {
    console.error('[Sender] Error downloading from Storage:', downloadError);
    throw new Error(`Failed to download media from Storage: ${downloadError?.message || 'no data'}`);
  }

  console.log(`[Sender] Downloaded ${fileData.size} bytes, uploading to WhatsApp...`);

  // 3. Upload to WhatsApp Cloud API: POST /{phone_number_id}/media
  const form = new FormData();
  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
  form.append('file', new Blob([fileData], { type: mimeType }), `audio.${extension}`);
  form.append('type', mimeType);
  form.append('messaging_product', 'whatsapp');

  const uploadRes = await fetch(
    `${WHATSAPP_API_URL}/${settings.whatsapp_phone_number_id}/media`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.whatsapp_access_token}` },
      body: form,
    }
  );

  const uploadData = await uploadRes.json();

  if (!uploadRes.ok || !uploadData.id) {
    console.error('[Sender] WhatsApp media upload error:', uploadData);
    throw new Error(uploadData.error?.message || 'WhatsApp media upload failed');
  }

  console.log('[Sender] Uploaded media to WhatsApp, ID:', uploadData.id);
  return uploadData.id;
}

async function sendMessage(supabase: any, settings: any, queueItem: any) {
  console.log(`[Sender] Sending message: ${queueItem.id}`);

  // Get contact phone number
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, whatsapp_id')
    .eq('id', queueItem.contact_id)
    .maybeSingle();

  if (!contact) {
    throw new Error('Contact not found');
  }

  const recipient = contact.whatsapp_id || contact.phone_number;

  // Resolve agent name prefix for human messages
  let finalContent = queueItem.content;
  let agentName: string | null = null;

  if (queueItem.from_type === 'human' && queueItem.message_id) {
    const { data: msgRecord } = await supabase
      .from('messages')
      .select('sender_user_id')
      .eq('id', queueItem.message_id)
      .maybeSingle();

    if (msgRecord?.sender_user_id) {
      agentName = await resolveAgentName(supabase, msgRecord.sender_user_id);

      if (agentName && finalContent && !finalContent.startsWith(`${agentName}:`) && !finalContent.startsWith(`*${agentName}:*`)) {
        finalContent = `*${agentName}:* ${finalContent}`;
        console.log(`[Sender] Prefixed agent name (bold): "${agentName}"`);
      }
    }
  }

  // Build WhatsApp API payload
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient
  };

  switch (queueItem.message_type) {
    case 'text':
      payload.type = 'text';
      payload.text = { body: finalContent };
      break;
    
    case 'image':
      payload.type = 'image';
      payload.image = { 
        link: queueItem.media_url,
        caption: finalContent || undefined
      };
      break;
    
    case 'audio': {
      // Robust mode: download from Storage → upload to WhatsApp → send with media ID
      const mediaId = await uploadMediaToWhatsApp(
        settings, supabase, queueItem.media_url,
        (queueItem.metadata as any)?.audio_mime_type || 'audio/ogg'
      );
      payload.type = 'audio';
      payload.audio = { id: mediaId };

      // Save whatsapp_media_id in message metadata for audit
      if (queueItem.message_id) {
        const existingMeta = (queueItem.metadata && typeof queueItem.metadata === 'object') ? queueItem.metadata : {};
        await supabase.from('messages').update({
          metadata: { ...existingMeta, whatsapp_media_id: mediaId }
        }).eq('id', queueItem.message_id);
      }
      break;
    }
    
    case 'document':
      payload.type = 'document';
      payload.document = { 
        link: queueItem.media_url,
        filename: queueItem.content || 'document'
      };
      break;
    
    default:
      payload.type = 'text';
      payload.text = { body: finalContent };
  }

  console.log('[Sender] WhatsApp API payload:', JSON.stringify(payload, null, 2));

  // Send via WhatsApp Cloud API
  const response = await fetch(
    `${WHATSAPP_API_URL}/${settings.whatsapp_phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const responseData = await response.json();

  if (!response.ok) {
    console.error('[Sender] WhatsApp API error:', responseData);
    throw new Error(responseData.error?.message || 'WhatsApp API error');
  }

  const whatsappMessageId = responseData.messages?.[0]?.id;
  console.log('[Sender] Message sent, WA ID:', whatsappMessageId);

  // Update or create message record in database
  if (queueItem.message_id) {
    // UPDATE existing message (for human messages)
    console.log('[Sender] Updating existing message:', queueItem.message_id);
    const updateData: any = {
      whatsapp_message_id: whatsappMessageId,
      status: 'sent',
      sent_at: new Date().toISOString()
    };

    // Save outgoing_text in metadata for audit if content was prefixed
    if (finalContent !== queueItem.content) {
      updateData.metadata = { ...(queueItem.metadata || {}), outgoing_text: finalContent };
    }

    const { error: msgError } = await supabase
      .from('messages')
      .update(updateData)
      .eq('id', queueItem.message_id);

    if (msgError) {
      console.error('[Sender] Error updating message record:', msgError);
      // Don't throw - message was sent successfully
    }
  } else {
    // INSERT new message (for Nina messages)
    console.log('[Sender] Creating new message record');
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: queueItem.conversation_id,
        whatsapp_message_id: whatsappMessageId,
        content: queueItem.content,
        type: queueItem.message_type,
        from_type: queueItem.from_type,
        status: 'sent',
        media_url: queueItem.media_url || null,
        sent_at: new Date().toISOString(),
        metadata: queueItem.metadata || {}
      });

    if (msgError) {
      console.error('[Sender] Error creating message record:', msgError);
      // Don't throw - message was sent successfully
    }
  }

  // Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', queueItem.conversation_id);
}
