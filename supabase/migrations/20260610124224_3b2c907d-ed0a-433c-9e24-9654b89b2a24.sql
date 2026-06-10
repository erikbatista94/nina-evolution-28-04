
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_instance_id ON public.messages(instance_id);

-- Backfill existing messages with the first active instance for the conversation's company
UPDATE public.messages m
SET instance_id = sub.instance_id
FROM (
  SELECT DISTINCT ON (c.id) c.id AS conv_id, i.id AS instance_id
  FROM public.conversations c
  JOIN public.instances i ON i.company_id = c.company_id AND i.is_active = true
  ORDER BY c.id, i.created_at ASC
) sub
WHERE m.conversation_id = sub.conv_id AND m.instance_id IS NULL;
