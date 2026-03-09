import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[GCal] Token refresh failed:', err);
    throw new Error('Falha ao renovar token do Google Calendar. Verifique as credenciais.');
  }

  const data = await resp.json();
  return data.access_token;
}

async function getSettings(supabase: any) {
  const { data, error } = await supabase
    .from('nina_settings')
    .select('google_client_id, google_client_secret, google_refresh_token, google_calendar_id, default_visit_duration, available_time_slots')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[GCal] Settings query error:', error);
    throw new Error(`Erro ao carregar configurações: ${error.message}`);
  }
  if (!data) {
    throw new Error('Nenhuma configuração encontrada na tabela nina_settings.');
  }

  const missing: string[] = [];
  if (!data.google_client_id) missing.push('Client ID');
  if (!data.google_client_secret) missing.push('Client Secret');
  if (!data.google_refresh_token) missing.push('Refresh Token');
  if (!data.google_calendar_id) missing.push('Calendar ID');

  if (missing.length > 0) {
    throw new Error(`Google Calendar: campos não configurados: ${missing.join(', ')}. Salve as credenciais em Configurações → APIs.`);
  }

  return data;
}

// Check availability using freebusy
async function checkAvailability(accessToken: string, calendarId: string, date: string, durationMinutes: number, availableSlots: string[]) {
  const dayStart = `${date}T00:00:00-03:00`;
  const dayEnd = `${date}T23:59:59-03:00`;

  const resp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: dayStart,
      timeMax: dayEnd,
      timeZone: 'America/Sao_Paulo',
      items: [{ id: calendarId }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[GCal] FreeBusy error:', err);
    throw new Error('Erro ao consultar disponibilidade');
  }

  const data = await resp.json();
  const busyPeriods = data.calendars?.[calendarId]?.busy || [];

  // Filter available slots
  const freeSlots = availableSlots.filter((slot: string) => {
    const [h, m] = slot.split(':').map(Number);
    const slotStart = new Date(`${date}T${slot}:00-03:00`);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);

    return !busyPeriods.some((busy: any) => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return slotStart < busyEnd && slotEnd > busyStart;
    });
  });

  return { date, freeSlots, busyPeriods: busyPeriods.length };
}

// Create event
async function createEvent(
  accessToken: string, 
  calendarId: string, 
  params: {
    title: string;
    date: string;
    time: string;
    duration: number;
    description?: string;
    location?: string;
  }
) {
  const startDateTime = `${params.date}T${params.time}:00`;
  const startDate = new Date(`${startDateTime}-03:00`);
  const endDate = new Date(startDate.getTime() + params.duration * 60000);

  const event = {
    summary: params.title,
    description: params.description || '',
    location: params.location || '',
    start: {
      dateTime: startDate.toISOString(),
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: 'America/Sao_Paulo',
    },
  };

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[GCal] Create event error:', err);
    throw new Error('Erro ao criar evento no Google Calendar');
  }

  const created = await resp.json();
  return { google_event_id: created.id, htmlLink: created.htmlLink };
}

// Sync events from Google Calendar to local DB
async function syncEvents(supabase: any, accessToken: string, calendarId: string) {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    }),
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[GCal] List events error:', err);
    throw new Error('Erro ao listar eventos do Google Calendar');
  }

  const data = await resp.json();
  const gcalEvents = data.items || [];
  let synced = 0;

  for (const event of gcalEvents) {
    if (!event.start?.dateTime) continue; // Skip all-day events

    const startDt = new Date(event.start.dateTime);
    const endDt = new Date(event.end?.dateTime || event.start.dateTime);
    const durationMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000);

    const date = startDt.toISOString().split('T')[0];
    const time = startDt.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false,
      timeZone: 'America/Sao_Paulo'
    });

    // Check if appointment already exists
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('google_event_id', event.id)
      .maybeSingle();

    if (existing) {
      // Update
      await supabase.from('appointments').update({
        title: event.summary || 'Evento Google Calendar',
        date,
        time,
        duration: durationMin || 60,
        description: event.description || null,
        google_sync_status: 'synced',
      }).eq('id', existing.id);
    } else {
      // Insert
      await supabase.from('appointments').insert({
        title: event.summary || 'Evento Google Calendar',
        date,
        time,
        duration: durationMin || 60,
        type: 'meeting',
        description: event.description || null,
        google_event_id: event.id,
        google_sync_status: 'synced',
        status: event.status === 'cancelled' ? 'cancelled' : 'scheduled',
      });
    }
    synced++;
  }

  // Remove local events that no longer exist in Google Calendar
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

  return { synced };
}

// Test connection
async function testConnection(accessToken: string, calendarId: string) {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!resp.ok) {
    throw new Error('Falha ao conectar com Google Calendar. Verifique o Calendar ID e as credenciais.');
  }

  const cal = await resp.json();
  return { success: true, calendarName: cal.summary, timeZone: cal.timeZone };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action } = body;

    // Load settings
    const settings = await getSettings(supabase);
    const accessToken = await getAccessToken(
      settings.google_client_id,
      settings.google_client_secret,
      settings.google_refresh_token
    );

    let result;

    switch (action) {
      case 'check-availability': {
        const { date, dates } = body;
        if (dates && Array.isArray(dates)) {
          // Check multiple dates
          const results = [];
          for (const d of dates) {
            const availability = await checkAvailability(
              accessToken, settings.google_calendar_id, d,
              settings.default_visit_duration,
              settings.available_time_slots
            );
            results.push(availability);
          }
          result = { availability: results };
        } else if (date) {
          result = await checkAvailability(
            accessToken, settings.google_calendar_id, date,
            settings.default_visit_duration,
            settings.available_time_slots
          );
        } else {
          throw new Error('Parâmetro "date" ou "dates" é obrigatório');
        }
        break;
      }

      case 'create-event': {
        const { title, date, time, duration, description, location, appointmentId, vendorName, clientName, clientPhone } = body;
        
        // Build description
        let fullDescription = description || '';
        if (clientName || clientPhone || vendorName) {
          fullDescription += '\n\n---\n';
          if (clientName) fullDescription += `Cliente: ${clientName}\n`;
          if (clientPhone) fullDescription += `Telefone: ${clientPhone}\n`;
          if (vendorName) fullDescription += `Vendedor: ${vendorName}\n`;
          fullDescription += 'Origem: Nina\n';
        }

        result = await createEvent(accessToken, settings.google_calendar_id, {
          title: title || 'Visita Técnica',
          date,
          time,
          duration: duration || settings.default_visit_duration,
          description: fullDescription,
          location,
        });

        // Update appointment if ID provided
        if (appointmentId && result.google_event_id) {
          await supabase.from('appointments').update({
            google_event_id: result.google_event_id,
            google_sync_status: 'synced',
          }).eq('id', appointmentId);
        }
        break;
      }

      case 'sync-events': {
        result = await syncEvents(supabase, accessToken, settings.google_calendar_id);
        break;
      }

      case 'test-connection': {
        result = await testConnection(accessToken, settings.google_calendar_id);
        break;
      }

      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GCal Edge Function] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
