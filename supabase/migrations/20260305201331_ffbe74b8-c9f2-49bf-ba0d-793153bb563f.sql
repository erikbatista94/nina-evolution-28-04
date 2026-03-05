ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS whatsapp_number text NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false;