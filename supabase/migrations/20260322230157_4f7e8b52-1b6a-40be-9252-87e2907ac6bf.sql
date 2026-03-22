
CREATE TYPE public.sla_level AS ENUM ('respond_now', 'loss_risk', 'stalled');

CREATE TABLE public.sla_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  assigned_user_id UUID,
  level public.sla_level NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  suggested_message TEXT,
  last_client_message_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sla_alerts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_sla_alerts_unique_open
  ON public.sla_alerts (conversation_id, level)
  WHERE resolved = false;

CREATE POLICY "Users can select own alerts"
  ON public.sla_alerts FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can resolve own alerts"
  ON public.sla_alerts FOR UPDATE TO authenticated
  USING (assigned_user_id = auth.uid())
  WITH CHECK (resolved = true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.sla_alerts;
