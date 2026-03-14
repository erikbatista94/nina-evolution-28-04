
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS customer_type text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS interest_services text[] DEFAULT '{}';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_size text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS has_project boolean;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS start_timeframe text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_temperature text DEFAULT 'frio';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'novo';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS next_best_action text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_id uuid;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz DEFAULT now();
