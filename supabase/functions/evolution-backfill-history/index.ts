import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jidToPhone(jid: string): { phone: string; isGroup: boolean } {
  if (!jid) return { phone: '', isGroup: false };
  const isGroup = jid.endsWith('@g.us');
  const digits = jid.split('@')[0].replace(/\D/g, '');
  return { phone: digits ? `+${digits}` : '', isGroup };
}

function decodeMessage(evMsg: any): { type: string; mediaType: string | null; content: string } {
  const m = evMsg?.message || {};
  if (m.conversation || m.extendedTextMessage) {
    return { type: 'text', mediaType: null, content: m.conversation || m.extendedTextMessage?.text || '' };
  }
  if (m.imageMessage) return { type: 'image', mediaType: 'image', content: m.imageMessage.caption || '[imagem]' };
  if (m.videoMessage) return { type: 'video', mediaType: 'video', content: m.videoMessage.caption || '[vídeo]' };
  if (m.audioMessage) return { type: 'audio', mediaType: 'audio', content: '[áudio]' };
  if (m.documentMessage) return { type: 'document', mediaType: 'document', content: m.documentMessage.fileName || '[documento]' };
  if (m.stickerMessage) return { type: 'image', mediaType: 'image', content: '[sticker]' };
  return { type: 'text', mediaType: null, content: '' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { url, apiKey, instance, limit = 50, messagesPerChat = 50 } = await req.json();
    if (!url || !apiKey || !instance) {
      return new Response(JSON.stringify({ ok: false, error: 'url, apiKey, instance required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base = url.replace(/\/+$/, '');
    const headers = { 'apikey': apiKey, 'Content-Type': 'application/json' };

    // Find owner/company
    const { data: inst } = await supabase
      .from('instances')
      .select('id, user_id, company_id')
      .eq('evolution_instance', instance)
      .maybeSingle();
    const companyId = inst?.company_id || null;
    const instanceRowId = inst?.id || null;

    // 1. Fetch chats
    const chatsRes = await fetch(`${base}/chat/findChats/${instance}`, {
      method: 'POST', headers, body: JSON.stringify({}),
    });
    if (!chatsRes.ok) {
      const text = await chatsRes.text();
      return new Response(JSON.stringify({ ok: false, error: `findChats failed: ${chatsRes.status}`, details: text }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const chatsData = await chatsRes.json();
    const chats: any[] = Array.isArray(chatsData) ? chatsData : (chatsData?.chats || chatsData?.data || []);

    let importedContacts = 0;
    let importedConversations = 0;
    let importedMessages = 0;
    let processed = 0;

    const sliced = chats.slice(0, limit);

    for (const chat of sliced) {
      const remoteJid: string = chat?.remoteJid || chat?.id || chat?.jid || '';
      const { phone, isGroup } = jidToPhone(remoteJid);
      if (!phone || isGroup) continue;
      processed++;

      const pushName = chat?.pushName || chat?.name || null;

      // Upsert contact
      let { data: contact } = await supabase
        .from('contacts').select('*').eq('phone_number', phone).maybeSingle();
      if (!contact) {
        const { data: nc, error: ce } = await supabase.from('contacts').insert({
          phone_number: phone,
          whatsapp_id: remoteJid,
          name: pushName,
          call_name: pushName?.split(' ')[0] || null,
          user_id: null,
          company_id: companyId,
        }).select().single();
        if (ce) { console.error('[Backfill] contact:', ce); continue; }
        contact = nc;
        importedContacts++;
      }

      // Get/create conversation
      let { data: conversation } = await supabase
        .from('conversations').select('*').eq('contact_id', contact.id).eq('is_active', true).maybeSingle();
      if (!conversation) {
        const { data: nc, error: ee } = await supabase.from('conversations').insert({
          contact_id: contact.id, status: 'human', is_active: true, user_id: null, company_id: companyId,
        }).select().single();
        if (ee) { console.error('[Backfill] conv:', ee); continue; }
        conversation = nc;
        importedConversations++;
      }

      // Fetch messages for this chat
      const msgsRes = await fetch(`${base}/chat/findMessages/${instance}`, {
        method: 'POST', headers,
        body: JSON.stringify({
          where: { key: { remoteJid } },
          limit: messagesPerChat,
        }),
      });
      if (!msgsRes.ok) continue;
      const msgsData = await msgsRes.json();
      const rawMsgs: any[] = Array.isArray(msgsData)
        ? msgsData
        : (msgsData?.messages?.records || msgsData?.records || msgsData?.data || msgsData?.messages || []);

      const sortedMsgs = [...rawMsgs].sort((a, b) =>
        Number(a?.messageTimestamp || 0) - Number(b?.messageTimestamp || 0)
      );

      for (const evMsg of sortedMsgs) {
        const waId = evMsg?.key?.id;
        if (!waId) continue;
        const { data: exists } = await supabase
          .from('messages').select('id').eq('whatsapp_message_id', waId).maybeSingle();
        if (exists) continue;

        const { type, mediaType, content } = decodeMessage(evMsg);
        const ts = Number(evMsg?.messageTimestamp || Math.floor(Date.now() / 1000));
        const fromMe = !!evMsg?.key?.fromMe;

        const { error: me } = await supabase.from('messages').insert({
          conversation_id: conversation.id,
          whatsapp_message_id: waId,
          content,
          type,
          from_type: fromMe ? 'human' : 'user',
          status: 'sent',
          media_type: mediaType,
          sent_at: new Date(ts * 1000).toISOString(),
          instance_id: instanceRowId,
          metadata: { backfill: true, evolution_message: evMsg?.message || {} },
        });
        if (!me) importedMessages++;
      }

      // Update conversation last_message_at
      await supabase.from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      chats_total: chats.length,
      chats_processed: processed,
      imported_contacts: importedContacts,
      imported_conversations: importedConversations,
      imported_messages: importedMessages,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Backfill] Error:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});