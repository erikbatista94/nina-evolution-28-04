ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_instance_id ON public.conversations(instance_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_instance ON public.conversations(contact_id, instance_id) WHERE is_active = true;

-- Backfill existing conversations: set instance_id from majority of their messages
UPDATE public.conversations c
SET instance_id = sub.instance_id
FROM (
  SELECT conversation_id, instance_id
  FROM (
    SELECT conversation_id, instance_id, COUNT(*) AS cnt,
           ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY COUNT(*) DESC) AS rn
    FROM public.messages
    WHERE instance_id IS NOT NULL
    GROUP BY conversation_id, instance_id
  ) ranked
  WHERE rn = 1
) sub
WHERE c.id = sub.conversation_id AND c.instance_id IS NULL;