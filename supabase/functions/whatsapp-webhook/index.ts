import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(promise: Promise<any>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROUPING_DELAY_MS = 3500;
const STATUS_RETRY_DELAY_MS = 2500;
const STATUS_MAX_RETRIES = 3;

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

// Extract phone from JID (e.g. "5511999999999@s.whatsapp.net" -> "+5511999999999")
function jidToPhone(jid: string): { phone: string; isGroup: boolean } {
  if (!jid) return { phone: '', isGroup: false };
  const isGroup = jid.endsWith('@g.us');
  const digits = jid.split('@')[0].replace(/\D/g, '');
  return { phone: digits ? `+${digits}` : '', isGroup };
}

// Map Evolution messageType to internal type
function mapMessageType(evoType: string | undefined, msg: any): { type: string; mediaType: string | null; content: string } {
  const m = msg?.message || {};
  if (m.conversation || m.extendedTextMessage) {
    return {
      type: 'text',
      mediaType: null,
      content: m.conversation || m.extendedTextMessage?.text || '',
    };
  }
  if (m.imageMessage) {
    return { type: 'image', mediaType: 'image', content: m.imageMessage.caption || '[imagem recebida]' };
  }
  if (m.videoMessage) {
    return { type: 'video', mediaType: 'video', content: m.videoMessage.caption || '[vídeo recebido]' };
  }
  if (m.audioMessage) {
    return { type: 'audio', mediaType: 'audio', content: '[áudio - processando transcrição...]' };
  }
  if (m.documentMessage) {
    return { type: 'document', mediaType: 'document', content: m.documentMessage.fileName || '[documento recebido]' };
  }
  if (m.stickerMessage) {
    return { type: 'image', mediaType: 'image', content: '[sticker recebido]' };
  }
  return { type: 'text', mediaType: null, content: `[${evoType || 'unknown'}]` };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Health check / Evolution doesn't need GET verification, but keep for compatibility
    if (req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', provider: 'evolution' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      console.log('[Webhook] Evolution payload event:', body?.event);

      const event: string = body?.event || '';
      const instance: string = body?.instance || '';
      const data = body?.data;

      if (!data) {
        return new Response(JSON.stringify({ status: 'ignored', reason: 'no data' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find owner by instance
      let ownerId: string | null = null;
      if (instance) {
        const { data: ownerSettings } = await supabase
          .from('nina_settings')
          .select('user_id')
          .eq('evolution_instance', instance)
          .maybeSingle();
        ownerId = ownerSettings?.user_id || null;
      }
      if (!ownerId) {
        const { data: adminRole } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin')
          .limit(1)
          .maybeSingle();
        ownerId = adminRole?.user_id || null;
      }

      // ---- STATUS UPDATE ----
      if (event === 'messages.update' || event === 'MESSAGES_UPDATE') {
        const updates = Array.isArray(data) ? data : [data];
        for (const upd of updates) {
          const waId = upd?.key?.id || upd?.keyId;
          const evoStatus: string | number = upd?.status ?? upd?.update?.status;
          if (!waId || evoStatus == null) continue;

          // Evolution status: SERVER_ACK=1, DELIVERY_ACK=2, READ=3, PLAYED=4 OR strings
          let newStatus: string | null = null;
          if (typeof evoStatus === 'number') {
            if (evoStatus >= 3) newStatus = 'read';
            else if (evoStatus === 2) newStatus = 'delivered';
            else if (evoStatus === 1) newStatus = 'sent';
          } else {
            const map: Record<string, string> = {
              SERVER_ACK: 'sent', DELIVERY_ACK: 'delivered', READ: 'read', PLAYED: 'read',
              sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed',
              ERROR: 'failed',
            };
            newStatus = map[evoStatus] || null;
          }
          if (!newStatus) continue;

          const updateData: Record<string, any> = { status: newStatus };
          if (newStatus === 'delivered') updateData.delivered_at = new Date().toISOString();
          if (newStatus === 'read') updateData.read_at = new Date().toISOString();

          let updated = false;
          for (let attempt = 1; attempt <= STATUS_MAX_RETRIES; attempt++) {
            const { data: updatedRows } = await supabase
              .from('messages')
              .update(updateData)
              .eq('whatsapp_message_id', waId)
              .select('id');
            if (updatedRows && updatedRows.length > 0) { updated = true; break; }
            if (attempt < STATUS_MAX_RETRIES) await new Promise(r => setTimeout(r, STATUS_RETRY_DELAY_MS));
          }
          if (!updated) console.warn(`[Webhook] Status ${newStatus} dropped: no msg for WA id ${waId}`);
        }
        return new Response(JSON.stringify({ status: 'processed_statuses' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ---- INCOMING MESSAGES ----
      if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
        const incoming = Array.isArray(data) ? data : [data];
        const processAfter = new Date(Date.now() + GROUPING_DELAY_MS).toISOString();

        for (const evMsg of incoming) {
          // Skip own messages
          if (evMsg?.key?.fromMe) {
            console.log('[Webhook] Skipping fromMe message');
            continue;
          }

          const remoteJid: string = evMsg?.key?.remoteJid || '';
          const { phone: phoneNumber, isGroup } = jidToPhone(remoteJid);
          if (!phoneNumber || isGroup) {
            console.log('[Webhook] Skipping group/empty jid:', remoteJid);
            continue;
          }

          const whatsappId = remoteJid;
          const contactName = evMsg?.pushName || null;
          const messageId = evMsg?.key?.id;
          const timestamp = evMsg?.messageTimestamp || Math.floor(Date.now() / 1000);

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
                user_id: null,
              })
              .select()
              .single();
            if (contactError) { console.error('[Webhook] contact err', contactError); continue; }
            contact = newContact;
            EdgeRuntime.waitUntil(
              fetch(`${supabaseUrl}/functions/v1/flowcrm-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                body: JSON.stringify({ event: 'lead', contact_id: contact.id }),
              }).catch(err => console.error('[Webhook] FlowCRM:', err))
            );
          } else {
            const updates: any = { last_activity: new Date().toISOString() };
            if (contactName && !contact.name) {
              updates.name = contactName;
              updates.call_name = contactName.split(' ')[0];
            }
            await supabase.from('contacts').update(updates).eq('id', contact.id);
          }

          // 2. Get or create conversation
          let { data: conversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('contact_id', contact.id)
            .eq('is_active', true)
            .maybeSingle();

          if (!conversation) {
            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({ contact_id: contact.id, status: 'nina', is_active: true, user_id: null })
              .select()
              .single();
            if (convError) { console.error('[Webhook] conv err', convError); continue; }
            conversation = newConv;
          }

          // 3. Decode message
          const { type: messageType, mediaType, content: messageContent } = mapMessageType(evMsg?.messageType, evMsg);

          // 4. Create message
          const m = evMsg?.message || {};
          const { data: dbMessage, error: msgError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversation.id,
              whatsapp_message_id: messageId,
              content: messageContent,
              type: messageType,
              from_type: 'user',
              status: 'sent',
              media_type: mediaType,
              sent_at: new Date(Number(timestamp) * 1000).toISOString(),
              metadata: {
                original_type: evMsg?.messageType || messageType,
                evolution_message: m,
                media_url: m.imageMessage?.url || m.audioMessage?.url || m.videoMessage?.url || m.documentMessage?.url || null,
                mime_type: m.imageMessage?.mimetype || m.audioMessage?.mimetype || m.videoMessage?.mimetype || m.documentMessage?.mimetype || null,
              },
            })
            .select()
            .single();

          if (msgError) {
            if (msgError.code === '23505') { console.log('[Webhook] dup msg ignored', messageId); continue; }
            console.error('[Webhook] msg err', msgError); continue;
          }

          // 4b. Urgency detection
          if (messageType === 'text' && messageContent && detectUrgencyFast(messageContent)) {
            await supabase.from('contacts').update({ is_urgent: true }).eq('id', contact.id).eq('is_urgent', false);
            await supabase.from('conversation_events').insert({
              conversation_id: conversation.id,
              contact_id: contact.id,
              event_type: 'urgency_detected',
              event_data: { trigger: 'keyword', source: 'webhook', snippet: messageContent.substring(0, 100) },
            }).then(() => {}).catch(() => {});
          }

          // 5. Update conversation
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversation.id);

          // 6. Reset grouping timer
          await supabase
            .from('message_grouping_queue')
            .update({ process_after: processAfter })
            .eq('processed', false)
            .eq('phone_number_id', instance)
            .filter('message_data->key->>remoteJid', 'eq', remoteJid);

          // 7. Insert into grouping queue (phone_number_id = instance for backwards compat)
          const { error: queueError } = await supabase
            .from('message_grouping_queue')
            .insert({
              whatsapp_message_id: messageId,
              phone_number_id: instance || 'evolution',
              message_id: dbMessage.id,
              message_data: evMsg,
              contacts_data: { wa_id: remoteJid, profile: { name: contactName } },
              process_after: processAfter,
            });
          if (queueError && queueError.code !== '23505') console.error('[Webhook] queue err', queueError);
        }

        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/message-grouper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ triggered_by: 'whatsapp-webhook' }),
          }).catch(err => console.error('[Webhook] grouper err', err))
        );

        return new Response(JSON.stringify({ status: 'processed' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Unknown event - acknowledge
      console.log('[Webhook] Unhandled event:', event);
      return new Response(JSON.stringify({ status: 'ignored', event }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
