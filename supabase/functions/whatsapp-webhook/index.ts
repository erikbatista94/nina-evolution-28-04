import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROUPING_DELAY_MS = 3500;
const STATUS_RETRY_DELAY_MS = 2500;
const STATUS_MAX_RETRIES = 3;

// Fast urgency detection keywords (lightweight, runs on every inbound)
const URGENCY_KEYWORDS = [
  'urgente', 'urgência', 'pressa', 'obra começou', 'obra já começou', 'obra comecou',
  'visita logo', 'orçamento rápido', 'orcamento rapido', 'fechar logo', 'fechar rápido',
  'prazo curto', 'prazo apertado', 'preciso logo', 'preciso urgente', 'o mais rápido',
  'o mais rapido', 'imediato', 'imediata', 'começar amanhã', 'comecar amanha',
  'semana que vem', 'essa semana', 'hoje mesmo', 'agora mesmo', 'não posso esperar',
  'nao posso esperar', 'precisando muito', 'correndo contra o tempo'
];

function detectUrgencyFast(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return URGENCY_KEYWORDS.some(kw => lower.includes(kw));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // GET = Webhook verification
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_verify_token')
        .not('whatsapp_verify_token', 'is', null)
        .limit(1)
        .maybeSingle();

      const verifyToken = settings?.whatsapp_verify_token || 'webhook-verify-token';

      if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] Verification successful');
        return new Response(challenge, { status: 200, headers: corsHeaders });
      } else {
        console.error('[Webhook] Verification failed');
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }
    }

    // POST = Incoming message
    if (req.method === 'POST') {
      const body = await req.json();
      console.log('[Webhook] Received payload:', JSON.stringify(body, null, 2));

      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      if (!value) {
        console.log('[Webhook] No value in payload, ignoring');
        return new Response(JSON.stringify({ status: 'ignored' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const messages = value.messages;
      const contacts = value.contacts;
      const phoneNumberId = value.metadata?.phone_number_id;

      // Find owner
      const { data: ownerSettings } = await supabase
        .from('nina_settings')
        .select('user_id, whatsapp_access_token')
        .eq('whatsapp_phone_number_id', phoneNumberId)
        .maybeSingle();

      let ownerId = ownerSettings?.user_id || null;
      
      if (!ownerId) {
        console.log('[Webhook] No owner in settings, looking for system admin...');
        const { data: adminRole } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin')
          .limit(1)
          .maybeSingle();
        
        ownerId = adminRole?.user_id || null;
        if (ownerId) {
          console.log('[Webhook] Using admin as owner:', ownerId);
        }
      }

      // Handle status updates with retry logic for race condition
      if (value.statuses) {
        for (const status of value.statuses) {
          console.log('[Webhook] Status update:', status.status, 'for WA ID:', status.id);
          
          if (status.id) {
            const statusMap: Record<string, string> = {
              'sent': 'sent',
              'delivered': 'delivered',
              'read': 'read',
              'failed': 'failed'
            };
            
            const newStatus = statusMap[status.status];
            if (!newStatus) continue;

            const updateData: Record<string, any> = { status: newStatus };
            if (newStatus === 'delivered') updateData.delivered_at = new Date().toISOString();
            if (newStatus === 'read') updateData.read_at = new Date().toISOString();

            // Try update with retries (race condition: sender may not have saved whatsapp_message_id yet)
            let updated = false;
            for (let attempt = 1; attempt <= STATUS_MAX_RETRIES; attempt++) {
              const { data: updatedRows, error: updateError } = await supabase
                .from('messages')
                .update(updateData)
                .eq('whatsapp_message_id', status.id)
                .select('id');

              if (updateError) {
                console.error(`[Webhook] Status update error (attempt ${attempt}):`, updateError);
                break;
              }

              if (updatedRows && updatedRows.length > 0) {
                console.log(`[Webhook] Status ${newStatus} applied to message ${updatedRows[0].id} (attempt ${attempt})`);
                updated = true;
                break;
              }

              // No rows found - sender may still be saving whatsapp_message_id
              if (attempt < STATUS_MAX_RETRIES) {
                console.log(`[Webhook] No message found for WA ID ${status.id}, retrying in ${STATUS_RETRY_DELAY_MS}ms (attempt ${attempt}/${STATUS_MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, STATUS_RETRY_DELAY_MS));
              }
            }

            if (!updated) {
              console.warn(`[Webhook] Status ${newStatus} DROPPED: no message found for WA ID ${status.id} after ${STATUS_MAX_RETRIES} attempts`);
            }
          }
        }
        
        return new Response(JSON.stringify({ status: 'processed_statuses' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Process incoming messages
      if (messages && messages.length > 0) {
        const processAfter = new Date(Date.now() + GROUPING_DELAY_MS).toISOString();

        for (const message of messages) {
          const contactInfo = contacts?.find((c: any) => c.wa_id === message.from);
          const phoneNumber = message.from;
          const whatsappId = contactInfo?.wa_id || phoneNumber;
          const contactName = contactInfo?.profile?.name || null;

          // 1. Get or create contact
          let { data: contact } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone_number', phoneNumber)
            .maybeSingle();

          if (!contact) {
            const { data: newContact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                phone_number: phoneNumber,
                whatsapp_id: whatsappId,
                name: contactName,
                call_name: contactName?.split(' ')[0] || null,
                user_id: null
              })
              .select()
              .single();

            if (contactError) {
              console.error('[Webhook] Error creating contact:', contactError);
              continue;
            }
            contact = newContact;
            console.log('[Webhook] Created new contact:', contact.id);
          } else {
            const updates: any = { last_activity: new Date().toISOString() };
            if (contactName && !contact.name) {
              updates.name = contactName;
              updates.call_name = contactName.split(' ')[0];
            }
            await supabase
              .from('contacts')
              .update(updates)
              .eq('id', contact.id);
          }

          // 2. Get or create conversation
          let { data: conversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('contact_id', contact.id)
            .eq('is_active', true)
            .maybeSingle();

          if (!conversation) {
            const { data: newConversation, error: convError } = await supabase
              .from('conversations')
              .insert({
                contact_id: contact.id,
                status: 'nina',
                is_active: true,
                user_id: null
              })
              .select()
              .single();

            if (convError) {
              console.error('[Webhook] Error creating conversation:', convError);
              continue;
            }
            conversation = newConversation;
            console.log('[Webhook] Created new conversation:', conversation.id);
          }

          // 3. Determine message content
          let messageContent = '';
          let messageType = 'text';
          let mediaType = null;

          switch (message.type) {
            case 'text':
              messageContent = message.text?.body || '';
              messageType = 'text';
              break;
            case 'image':
              messageContent = message.image?.caption || '[imagem recebida]';
              messageType = 'image';
              mediaType = 'image';
              break;
            case 'audio':
              messageContent = '[áudio - processando transcrição...]';
              messageType = 'audio';
              mediaType = 'audio';
              break;
            case 'video':
              messageContent = message.video?.caption || '[vídeo recebido]';
              messageType = 'video';
              mediaType = 'video';
              break;
            case 'document':
              messageContent = message.document?.filename || '[documento recebido]';
              messageType = 'document';
              mediaType = 'document';
              break;
            default:
              messageContent = `[${message.type}]`;
          }

          // 4. Create message
          const { data: dbMessage, error: msgError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversation.id,
              whatsapp_message_id: message.id,
              content: messageContent,
              type: messageType,
              from_type: 'user',
              status: 'sent',
              media_type: mediaType,
              sent_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
              metadata: { 
                original_type: message.type,
                media_id: message.audio?.id || message.image?.id || message.video?.id || message.document?.id || null
              }
            })
            .select()
            .single();

          if (msgError) {
            if (msgError.code === '23505') {
              console.log('[Webhook] Duplicate message ignored:', message.id);
              continue;
            }
            console.error('[Webhook] Error creating message:', msgError);
            continue;
          }

          console.log('[Webhook] Created message:', dbMessage.id, 'for conversation:', conversation.id);

          // 5. Update conversation
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversation.id);

          // 6. Reset timer for pending queue entries
          await supabase
            .from('message_grouping_queue')
            .update({ process_after: processAfter })
            .eq('processed', false)
            .eq('phone_number_id', phoneNumberId)
            .filter('message_data->>from', 'eq', phoneNumber);

          // 7. Insert into grouping queue
          const { error: queueError } = await supabase
            .from('message_grouping_queue')
            .insert({
              whatsapp_message_id: message.id,
              phone_number_id: phoneNumberId,
              message_id: dbMessage.id,
              message_data: message,
              contacts_data: contactInfo || null,
              process_after: processAfter
            });

          if (queueError) {
            if (queueError.code === '23505') {
              console.log('[Webhook] Duplicate queue entry ignored:', message.id);
            } else {
              console.error('[Webhook] Queue insert error:', queueError);
            }
          } else {
            console.log('[Webhook] Message queued:', message.id, 'process_after:', processAfter);
          }
        }

        // Trigger message-grouper in background
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/message-grouper`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'whatsapp-webhook' })
          }).catch(err => console.error('[Webhook] Error triggering message-grouper:', err))
        );
      }

      return new Response(JSON.stringify({ status: 'processed' }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
