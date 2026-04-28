ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS evolution_api_url TEXT,
  ADD COLUMN IF NOT EXISTS evolution_api_key TEXT,
  ADD COLUMN IF NOT EXISTS evolution_instance TEXT,
  ADD COLUMN IF NOT EXISTS evolution_connection_status TEXT DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS evolution_last_check TIMESTAMP WITH TIME ZONE;