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
    const { template_name, variables, contact_id, conversation_id, user_id } = await req.json();

    if (!template_name || !contact_id || !conversation_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields: template_name, contact_id, conversation_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Fetch template
    const { data: template, error: tplErr } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('name', template_name)
      .eq('is_active', true)
      .maybeSingle();

    if (tplErr || !template) {
      return new Response(JSON.stringify({ error: 'Template not found or inactive' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Get contact phone
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone_number, whatsapp_id')
      .eq('id', contact_id)
      .maybeSingle();

    if (!contact) {
      return new Response(JSON.stringify({ error: 'Contact not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const recipient = contact.whatsapp_id || contact.phone_number;

    // 3. Get conversation user_id for settings lookup
    const { data: conversation } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', conversation_id)
      .maybeSingle();

    const convUserId = conversation?.user_id;

    // 4. Get WhatsApp settings
    let settings = null;
    if (convUserId) {
      const { data } = await supabase
        .from('nina_settings')
        .select('whatsapp_access_token, whatsapp_phone_number_id')
        .eq('user_id', convUserId)
        .maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await supabase
        .from('nina_settings')
        .select('whatsapp_access_token, whatsapp_phone_number_id')
        .is('user_id', null)
        .maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await supabase
        .from('nina_settings')
        .select('whatsapp_access_token, whatsapp_phone_number_id')
        .not('whatsapp_phone_number_id', 'is', null)
        .limit(1)
        .maybeSingle();
      settings = data;
    }

    if (!settings?.whatsapp_access_token || !settings?.whatsapp_phone_number_id) {
      return new Response(JSON.stringify({ error: 'WhatsApp not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. Build template message content (replace variables for display)
    let renderedContent = template.content;
    const vars = variables || {};
    Object.keys(vars).forEach(key => {
      renderedContent = renderedContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), vars[key]);
    });

    // 6. Build WhatsApp template payload
    // The template_name must match the approved template on Meta Business
    const components: any[] = [];
    const templateVars = template.variables as any[] || [];
    if (templateVars.length > 0) {
      const parameters = templateVars.map((v: any) => ({
        type: 'text',
        text: vars[v.key] || ''
      }));
      components.push({
        type: 'body',
        parameters
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name: template_name,
        language: { code: template.language || 'pt_BR' },
        components: components.length > 0 ? components : undefined
      }
    };

    console.log('[SendTemplate] Payload:', JSON.stringify(payload, null, 2));

    // 7. Send via WhatsApp Cloud API
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
      console.error('[SendTemplate] WhatsApp API error:', responseData);
      const errorMsg = responseData.error?.message || 'WhatsApp API error';
      const errorCode = responseData.error?.code || response.status;
      return new Response(JSON.stringify({ 
        error: errorMsg, 
        code: errorCode,
        details: responseData.error 
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const whatsappMessageId = responseData.messages?.[0]?.id;
    console.log('[SendTemplate] Sent successfully, WA ID:', whatsappMessageId);

    // 8. Create message record
    await supabase.from('messages').insert({
      conversation_id,
      whatsapp_message_id: whatsappMessageId,
      content: renderedContent,
      type: 'text',
      from_type: 'human',
      status: 'sent',
      sent_at: new Date().toISOString(),
      sender_user_id: user_id || null,
      metadata: {
        template_name,
        variables: vars,
        is_template: true
      }
    });

    // 9. Register conversation event
    await supabase.from('conversation_events').insert({
      conversation_id,
      contact_id,
      event_type: 'template_sent',
      event_data: {
        template_name,
        template_display_name: template.display_name,
        variables: vars,
        user_id,
        whatsapp_message_id: whatsappMessageId,
        api_response_status: response.status
      }
    });

    // 10. Update conversation last_message_at
    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString()
    }).eq('id', conversation_id);

    return new Response(JSON.stringify({
      success: true,
      whatsapp_message_id: whatsappMessageId,
      rendered_content: renderedContent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SendTemplate] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
