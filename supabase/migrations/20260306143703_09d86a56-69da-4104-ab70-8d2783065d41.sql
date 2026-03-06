
-- Google Calendar config na nina_settings
ALTER TABLE public.nina_settings 
  ADD COLUMN IF NOT EXISTS google_client_id text NULL,
  ADD COLUMN IF NOT EXISTS google_client_secret text NULL,
  ADD COLUMN IF NOT EXISTS google_refresh_token text NULL,
  ADD COLUMN IF NOT EXISTS google_calendar_id text NULL,
  ADD COLUMN IF NOT EXISTS default_visit_duration integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS available_time_slots jsonb NOT NULL DEFAULT '["08:00","09:30","11:00","13:00","14:30","16:00"]'::jsonb;

-- Google Calendar email por vendedor
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS google_calendar_email text NULL;

-- Endereço do contato
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS address_full text NULL;

-- Google Event ID no appointment
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS google_event_id text NULL,
  ADD COLUMN IF NOT EXISTS google_sync_status text NULL DEFAULT 'local';
