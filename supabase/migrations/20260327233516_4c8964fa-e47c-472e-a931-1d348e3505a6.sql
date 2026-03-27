
-- Block 1: followup_tasks table
CREATE TABLE public.followup_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  assigned_user_id UUID,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','dismissed')),
  suggested_message TEXT,
  temperature TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.followup_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own followups" ON public.followup_tasks FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own followups" ON public.followup_tasks FOR UPDATE TO authenticated
  USING (assigned_user_id = auth.uid()) WITH CHECK (true);

-- Only unique pending followup per conversation
CREATE UNIQUE INDEX idx_followup_unique_pending ON public.followup_tasks (conversation_id) WHERE status = 'pending';

ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_tasks;

-- Add auto_followup_enabled to nina_settings
ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS auto_followup_enabled BOOLEAN DEFAULT false;
