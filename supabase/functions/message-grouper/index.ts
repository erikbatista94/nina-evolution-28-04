import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[MessageGrouper] Starting message grouping...');

    // Fetch messages ready to process (timer expired and not processed)
    const { data: readyMessages, error: fetchError } = await supabase
      .from('message_grouping_queue')
      .select('*')
      .eq('processed', false)
      .lte('process_after', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('[MessageGrouper] Error fetching messages:', fetchError);
      throw fetchError;
    }

    if (!readyMessages || readyMessages.length === 0) {
      console.log('[MessageGrouper] No messages ready to process');
      
      // Check if there are pending messages with future process_after and schedule re-invocation
      await scheduleNextProcessing(supabase, supabaseUrl, supabaseServiceKey);
      
      return new Response(JSON.stringify({ processed: 0, groups: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[MessageGrouper] Found ${readyMessages.length} messages ready to process`);

    // IMMEDIATELY mark all ready messages as processed to prevent duplicates
    const readyIds = readyMessages.map(m => m.id);
    await supabase
      .from('message_grouping_queue')
      .update({ processed: true })
      .in('id', readyIds);

    console.log(`[MessageGrouper] Marked ${readyIds.length} messages as processed`);

    // Group messages by phone number
    const grouped: Record<string, typeof readyMessages> = {};
    for (const msg of readyMessages) {
      // Evolution stores remoteJid in key.remoteJid; fallback to legacy `from`
      const phone = msg.message_data?.key?.remoteJid || msg.message_data?.from;
      if (!phone) continue;
      if (!grouped[phone]) grouped[phone] = [];
      grouped[phone].push(msg);
    }

    const groupCount = Object.keys(grouped).length;
    console.log(`[MessageGrouper] Grouped into ${groupCount} phone numbers`);

    let processedCount = 0;

    // Process each group
    for (const [phoneNumber, messages] of Object.entries(grouped)) {
      try {
        console.log(`[MessageGrouper] Processing group for ${phoneNumber} with ${messages.length} messages`);

        // For Evolution, phone_number_id stores the instance name
        const phoneNumberId = messages[0].phone_number_id;

        // Get owner settings by evolution_instance
        let { data: ownerSettings } = await supabase
          .from('nina_settings')
          .select('user_id, evolution_api_url, evolution_api_key, evolution_instance')
          .eq('evolution_instance', phoneNumberId)
          .maybeSingle();

        // Fallback: any settings with Evolution configured (single-tenant)
        if (!ownerSettings?.evolution_api_key) {
          console.log(`[MessageGrouper] No settings for instance ${phoneNumberId}, fallback`);
          const { data: fallbackSettings } = await supabase
            .from('nina_settings')
            .select('user_id, evolution_api_url, evolution_api_key, evolution_instance')
            .not('evolution_api_key', 'is', null)
            .limit(1)
            .maybeSingle();
          if (fallbackSettings) {
            ownerSettings = fallbackSettings;
          } else {
            console.warn('[MessageGrouper] No Evolution settings found');
          }
        }

        // Get all message_ids from the queue entries
        const messageIds = messages.map(m => m.message_id).filter(Boolean);
        
        if (messageIds.length === 0) {
          console.log(`[MessageGrouper] No message_ids found for group ${phoneNumber}, skipping`);
          continue;
        }

        // Fetch the actual messages from the database
        const { data: dbMessages, error: dbMsgError } = await supabase
          .from('messages')
          .select('*')
          .in('id', messageIds)
          .order('sent_at', { ascending: true });

        if (dbMsgError || !dbMessages || dbMessages.length === 0) {
          console.error('[MessageGrouper] Error fetching messages from DB:', dbMsgError);
          continue;
        }

        // Get the last message's conversation for context
        const lastDbMessage = dbMessages[dbMessages.length - 1];
        const conversationId = lastDbMessage.conversation_id;

        // Get conversation details
        const { data: conversation } = await supabase
          .from('conversations')
          .select('*, contacts(*)')
          .eq('id', conversationId)
          .single();

        if (!conversation) {
          console.error('[MessageGrouper] Conversation not found:', conversationId);
          continue;
        }

        // Combine content and handle audio transcription
        const combinedContent = await combineAndTranscribeMessages(
          supabase,
          messages,
          dbMessages,
          ownerSettings,
          lovableApiKey
        );

        console.log(`[MessageGrouper] Combined content for ${phoneNumber}:`, combinedContent.substring(0, 200));

        // Update the last message with combined content if multiple messages
        if (dbMessages.length > 1) {
          await supabase
            .from('messages')
            .update({
              content: combinedContent,
              metadata: {
                ...lastDbMessage.metadata,
                grouped_messages: messageIds,
                message_count: messageIds.length
              }
            })
            .eq('id', lastDbMessage.id);
          
          console.log(`[MessageGrouper] Updated last message with combined content`);
        } else if (dbMessages[0].type === 'audio' && combinedContent !== dbMessages[0].content) {
          // Update single audio message with transcription
          await supabase
            .from('messages')
            .update({ content: combinedContent })
            .eq('id', dbMessages[0].id);
          
          console.log(`[MessageGrouper] Updated audio message with transcription`);
        }

        // If conversation is handled by Nina, queue for AI processing
        if (conversation.status === 'nina') {
          // Check if already in queue to avoid duplicates
          const { data: existingQueue } = await supabase
            .from('nina_processing_queue')
            .select('id')
            .eq('message_id', lastDbMessage.id)
            .maybeSingle();

          if (!existingQueue) {
            const { error: ninaQueueError } = await supabase
              .from('nina_processing_queue')
              .insert({
                message_id: lastDbMessage.id,
                conversation_id: conversationId,
                contact_id: conversation.contact_id,
                priority: 1,
                context_data: {
                  phone_number_id: phoneNumberId,
                  contact_name: conversation.contacts?.name || conversation.contacts?.call_name,
                  message_type: lastDbMessage.type,
                  grouped_count: messageIds.length,
                  combined_content: combinedContent
                }
              });

            if (ninaQueueError) {
              console.error('[MessageGrouper] Error queuing for Nina:', ninaQueueError);
            } else {
              console.log('[MessageGrouper] Message queued for Nina processing');
              
              // Trigger nina-orchestrator
              fetch(`${supabaseUrl}/functions/v1/nina-orchestrator`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`
                },
                body: JSON.stringify({ triggered_by: 'message-grouper' })
              }).catch(err => console.error('[MessageGrouper] Error triggering nina-orchestrator:', err));
            }
          } else {
            console.log('[MessageGrouper] Message already in Nina queue, skipping');
          }
        }

        processedCount += messages.length;
        console.log(`[MessageGrouper] Group ${phoneNumber} processed successfully`);

      } catch (groupError) {
        console.error(`[MessageGrouper] Error processing group ${phoneNumber}:`, groupError);
      }
    }

    console.log(`[MessageGrouper] Completed. Processed ${processedCount} messages in ${groupCount} groups`);

    // Check if there are more pending messages and schedule re-invocation
    await scheduleNextProcessing(supabase, supabaseUrl, supabaseServiceKey);

    return new Response(JSON.stringify({ 
      processed: processedCount, 
      groups: groupCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[MessageGrouper] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Combine content from multiple messages and transcribe audio
async function combineAndTranscribeMessages(
  supabase: any,
  queueMessages: any[],
  dbMessages: any[],
  settings: any,
  lovableApiKey: string
): Promise<string> {
  const contentParts: string[] = [];
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  for (let i = 0; i < queueMessages.length; i++) {
    const queueMsg = queueMessages[i];
    const dbMsg = dbMessages.find(m => m.id === queueMsg.message_id);
    const messageData = queueMsg.message_data;
    
    if (!dbMsg) continue;

    let content = dbMsg.content || '';

    // Evolution: media is inside messageData.message.{type}Message
    const evMsg = messageData?.message || {};
    let mediaType: string | null = null;
    let mediaNode: any = null;
    if (evMsg.imageMessage) { mediaType = 'image'; mediaNode = evMsg.imageMessage; }
    else if (evMsg.audioMessage) { mediaType = 'audio'; mediaNode = evMsg.audioMessage; }
    else if (evMsg.videoMessage) { mediaType = 'video'; mediaNode = evMsg.videoMessage; }
    else if (evMsg.documentMessage) { mediaType = 'document'; mediaNode = evMsg.documentMessage; }

    const mediaUrl = mediaNode?.url || null;
    const evoMessageId = messageData?.key?.id;

    // Handle media download + upload to Storage (for all media types)
    if (mediaType && mediaNode && ['image', 'video', 'document'].includes(mediaType)) {
      console.log(`[MessageGrouper] Downloading ${mediaType} media via Evolution`);
      const mediaResult = await downloadEvolutionMedia(settings, evoMessageId, mediaUrl, mediaNode?.mimetype);
      if (mediaResult) {
        const ext = getFileExtension(mediaType, mediaNode?.mimetype, mediaNode?.fileName);
        const storagePath = `${dbMsg.conversation_id}/${dbMsg.id}.${ext}`;
        const mimeType = mediaResult.mimeType || mediaNode?.mimetype || getMimeType(mediaType);
        
        const publicUrl = await uploadMediaToStorage(supabase, supabaseUrl, mediaResult.buffer, storagePath, mimeType);
        if (publicUrl) {
          await supabase
            .from('messages')
            .update({ media_url: publicUrl })
            .eq('id', dbMsg.id);
        }
      }
    }

    // Handle audio transcription
    if (mediaType === 'audio') {
      if (lovableApiKey && (mediaUrl || evoMessageId)) {
        const mediaResult = await downloadEvolutionMedia(settings, evoMessageId, mediaUrl, mediaNode?.mimetype || 'audio/ogg');
        if (mediaResult) {
          // Upload audio to storage too
          const storagePath = `${dbMsg.conversation_id}/${dbMsg.id}.ogg`;
          const publicUrl = await uploadMediaToStorage(supabase, supabaseUrl, mediaResult.buffer, storagePath, 'audio/ogg');
          if (publicUrl) {
            await supabase
              .from('messages')
              .update({ media_url: publicUrl })
              .eq('id', dbMsg.id);
          }

          const transcription = await transcribeAudio(mediaResult.buffer, lovableApiKey);
          if (transcription) {
            content = transcription;
            await supabase
              .from('messages')
              .update({ content: transcription })
              .eq('id', dbMsg.id);
          }
        }
      }
    }

    if (content && content !== '[áudio - processando transcrição...]') {
      contentParts.push(content);
    }
  }

  return contentParts.join('\n');
}

// Upload media to Supabase Storage
async function uploadMediaToStorage(
  supabase: any,
  supabaseUrl: string,
  buffer: ArrayBuffer,
  path: string,
  mimeType: string
): Promise<string | null> {
  try {
    const blob = new Blob([buffer], { type: mimeType });
    const { error } = await supabase.storage
      .from('whatsapp-media')
      .upload(path, blob, { contentType: mimeType, upsert: true });

    if (error) {
      console.error('[MessageGrouper] Storage upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(path);

    return urlData?.publicUrl || null;
  } catch (error) {
    console.error('[MessageGrouper] Error uploading to storage:', error);
    return null;
  }
}

function getFileExtension(mediaType: string, mimeType?: string, filename?: string): string {
  if (filename) {
    const ext = filename.split('.').pop();
    if (ext) return ext;
  }
  if (mimeType) {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'video/mp4': 'mp4', 'video/3gpp': '3gp',
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/msword': 'doc',
    };
    if (map[mimeType]) return map[mimeType];
  }
  const defaults: Record<string, string> = { image: 'jpg', video: 'mp4', document: 'pdf', audio: 'ogg' };
  return defaults[mediaType] || 'bin';
}

function getMimeType(mediaType: string): string {
  const defaults: Record<string, string> = {
    image: 'image/jpeg', video: 'video/mp4', document: 'application/pdf', audio: 'audio/ogg'
  };
  return defaults[mediaType] || 'application/octet-stream';
}

// Download media from WhatsApp API
async function downloadWhatsAppMedia(settings: any, mediaId: string): Promise<{ buffer: ArrayBuffer; mimeType: string | null } | null> {
  if (!settings?.whatsapp_access_token) {
    console.error('[MessageGrouper] No WhatsApp access token configured');
    return null;
  }

  try {
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`
        }
      }
    );

    if (!mediaInfoResponse.ok) {
      console.error('[MessageGrouper] Failed to get media info:', await mediaInfoResponse.text());
      return null;
    }

    const mediaInfo = await mediaInfoResponse.json();
    const mediaUrl = mediaInfo.url;
    const mimeType = mediaInfo.mime_type || null;

    if (!mediaUrl) {
      console.error('[MessageGrouper] No media URL in response');
      return null;
    }

    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`
      }
    });

    if (!mediaResponse.ok) {
      console.error('[MessageGrouper] Failed to download media:', await mediaResponse.text());
      return null;
    }

    const buffer = await mediaResponse.arrayBuffer();
    return { buffer, mimeType };
  } catch (error) {
    console.error('[MessageGrouper] Error downloading media:', error);
    return null;
  }
}


// Transcribe audio using Lovable AI Gateway (Whisper)
async function transcribeAudio(audioBuffer: ArrayBuffer, lovableApiKey: string): Promise<string | null> {
  try {
    console.log('[MessageGrouper] Transcribing audio, size:', audioBuffer.byteLength, 'bytes');

    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MessageGrouper] Transcription error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const transcription = result.text;
    
    console.log('[MessageGrouper] Transcription result:', transcription);
    return transcription || null;
  } catch (error) {
    console.error('[MessageGrouper] Error transcribing audio:', error);
    return null;
  }
}

// Schedule next processing if there are pending messages with future process_after
async function scheduleNextProcessing(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<void> {
  try {
    // Check for pending messages with future process_after
    const { data: pendingMessages, error } = await supabase
      .from('message_grouping_queue')
      .select('id, process_after')
      .eq('processed', false)
      .gt('process_after', new Date().toISOString())
      .order('process_after', { ascending: true })
      .limit(1);

    if (error) {
      console.error('[MessageGrouper] Error checking pending messages:', error);
      return;
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      console.log('[MessageGrouper] No pending messages to schedule');
      return;
    }

    const nextProcessAt = new Date(pendingMessages[0].process_after);
    const now = Date.now();
    const delayMs = Math.max(nextProcessAt.getTime() - now + 500, 1000); // +500ms buffer, min 1s
    
    // Cap delay at 30 seconds to prevent edge function timeout issues
    const cappedDelayMs = Math.min(delayMs, 30000);

    console.log(`[MessageGrouper] Scheduling self-invocation in ${cappedDelayMs}ms for pending message ${pendingMessages[0].id}`);

    // Use EdgeRuntime.waitUntil for background task
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            console.log('[MessageGrouper] Self-invoking after scheduled delay');
            await fetch(`${supabaseUrl}/functions/v1/message-grouper`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({ triggered_by: 'self-reschedule' })
            });
            console.log('[MessageGrouper] Self-invocation completed');
          } catch (err) {
            console.error('[MessageGrouper] Self-reschedule error:', err);
          }
          resolve();
        }, cappedDelayMs);
      })
    );
  } catch (error) {
    console.error('[MessageGrouper] Error scheduling next processing:', error);
  }
}
