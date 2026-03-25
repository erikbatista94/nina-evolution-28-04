import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate cron secret
    const cronSecret = Deno.env.get('CRON_SECRET');
    const headerSecret = req.headers.get('x-cron-secret');

    if (!cronSecret || headerSecret !== cronSecret) {
      console.error('[GCal-Sync] Invalid or missing x-cron-secret header');
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[GCal-Sync] Starting auto-sync...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load Google Calendar settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('google_client_id, google_client_secret, google_refresh_token, google_calendar_id')
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) {
      console.log('[GCal-Sync] No settings found, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'no settings' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!settings.google_client_id || !settings.google_client_secret || !settings.google_refresh_token || !settings.google_calendar_id) {
      console.log('[GCal-Sync] Google Calendar not configured, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Refresh access token
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.google_client_id,
        client_secret: settings.google_client_secret,
        refresh_token: settings.google_refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      console.error('[GCal-Sync] Token refresh failed:', err);
      return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    const calendarId = settings.google_calendar_id;

    // Fetch events: today to +60 days
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const timeMax = futureDate.toISOString();

    const eventsResp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
      new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      }),
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!eventsResp.ok) {
      const err = await eventsResp.text();
      console.error('[GCal-Sync] Events list error:', err);
      return new Response(JSON.stringify({ error: 'Failed to list events' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const eventsData = await eventsResp.json();
    const gcalEvents = eventsData.items || [];
    let synced = 0;

    for (const event of gcalEvents) {
      if (!event.start?.dateTime) continue; // Skip all-day

      const startDt = new Date(event.start.dateTime);
      const endDt = new Date(event.end?.dateTime || event.start.dateTime);
      const durationMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000);

      const date = startDt.toISOString().split('T')[0];
      const time = startDt.toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo'
      });

      const { data: existing } = await supabase
        .from('appointments')
        .select('id')
        .eq('google_event_id', event.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('appointments').update({
          title: event.summary || 'Evento Google Calendar',
          date, time,
          duration: durationMin || 60,
          description: event.description || null,
          location: event.location || null,
          google_sync_status: 'synced',
        }).eq('id', existing.id);
      } else {
        await supabase.from('appointments').insert({
          title: event.summary || 'Evento Google Calendar',
          date, time,
          duration: durationMin || 60,
          type: 'meeting',
          description: event.description || null,
          location: event.location || null,
          google_event_id: event.id,
          google_sync_status: 'synced',
          status: event.status === 'cancelled' ? 'cancelled' : 'scheduled',
        });
      }
      synced++;
    }

    // Remove local synced events that no longer exist in Google
    const gcalIds = gcalEvents.map((e: any) => e.id).filter(Boolean);
    if (gcalIds.length > 0) {
      const { data: localSynced } = await supabase
        .from('appointments')
        .select('id, google_event_id')
        .eq('google_sync_status', 'synced')
        .not('google_event_id', 'is', null);

      if (localSynced) {
        for (const local of localSynced) {
          if (!gcalIds.includes(local.google_event_id)) {
            await supabase.from('appointments').delete().eq('id', local.id);
            synced++;
          }
        }
      }
    }

    console.log(`[GCal-Sync] Done. Synced ${synced} events.`);

    return new Response(JSON.stringify({ success: true, synced }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[GCal-Sync] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
