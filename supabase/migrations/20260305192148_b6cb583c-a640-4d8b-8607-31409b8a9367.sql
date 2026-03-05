
-- Round-robin counter tracker per team member
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS rr_counter integer NOT NULL DEFAULT 0;

-- Weighted round-robin assignment function
CREATE OR REPLACE FUNCTION public.assign_conversation_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  selected_member RECORD;
BEGIN
  -- Only assign if not already assigned
  IF NEW.assigned_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Pick active member with lowest (rr_counter / weight) ratio
  -- On tie, pick by name for determinism
  SELECT id, user_id INTO selected_member
  FROM public.team_members
  WHERE status = 'active'
    AND weight > 0
  ORDER BY (rr_counter::float / weight) ASC, name ASC
  LIMIT 1;

  -- No active members → skip assignment
  IF selected_member IS NULL THEN
    RETURN NEW;
  END IF;

  -- Assign conversation
  NEW.assigned_user_id := selected_member.user_id;

  -- Increment counter
  UPDATE public.team_members
  SET rr_counter = rr_counter + 1
  WHERE id = selected_member.id;

  RETURN NEW;
END;
$$;

-- Trigger on conversations INSERT
CREATE TRIGGER trg_assign_conversation_round_robin
  BEFORE INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_conversation_round_robin();
