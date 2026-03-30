
-- 1. Add qualification_gaps to contacts for radar feature
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS qualification_gaps JSONB DEFAULT '[]'::jsonb;

-- 2. Expand followup_tasks for smart retomada
ALTER TABLE public.followup_tasks ADD COLUMN IF NOT EXISTS stall_reason TEXT;
ALTER TABLE public.followup_tasks ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;
ALTER TABLE public.followup_tasks ADD COLUMN IF NOT EXISTS result TEXT;
ALTER TABLE public.followup_tasks ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;

-- 3. Conversation ownership fields
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS human_status TEXT DEFAULT 'active';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_human_interaction_at TIMESTAMPTZ;

-- 4. Create conversation_ownership_log
CREATE TABLE IF NOT EXISTS public.conversation_ownership_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  previous_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.conversation_ownership_log ENABLE ROW LEVEL SECURITY;

-- RLS: admin sees all, seller sees only logs where they are user_id or previous_user_id
CREATE POLICY "Admin reads all ownership logs" ON public.conversation_ownership_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Seller reads own ownership logs" ON public.conversation_ownership_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR previous_user_id = auth.uid());

CREATE POLICY "Authenticated insert ownership logs" ON public.conversation_ownership_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 5. Create conversation_events for learning
CREATE TABLE IF NOT EXISTS public.conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  contact_id UUID,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

-- RLS: only admin reads events
CREATE POLICY "Admin reads events" ON public.conversation_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role inserts via edge functions, but also allow authenticated insert
CREATE POLICY "Authenticated insert events" ON public.conversation_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Indexes for conversation_events
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation_id ON public.conversation_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_contact_id ON public.conversation_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_event_type ON public.conversation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_conversation_events_created_at ON public.conversation_events(created_at);

-- Index for ownership log
CREATE INDEX IF NOT EXISTS idx_ownership_log_conversation_id ON public.conversation_ownership_log(conversation_id);

-- Unique index for followup_tasks: only one pending per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_unique_pending ON public.followup_tasks(conversation_id) WHERE status = 'pending';
