
CREATE OR REPLACE FUNCTION public.assign_conversation_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  selected_member RECORD;
  instance_user UUID;
BEGIN
  -- Never overwrite an explicit assignment
  IF NEW.assigned_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) If the conversation's instance has a dedicated atendente, route there
  IF NEW.instance_id IS NOT NULL THEN
    SELECT user_id INTO instance_user
    FROM public.instances
    WHERE id = NEW.instance_id
      AND user_id IS NOT NULL
      AND is_active = true;

    IF instance_user IS NOT NULL THEN
      NEW.assigned_user_id := instance_user;
      RETURN NEW;
    END IF;
  END IF;

  -- 2) Fallback: weighted round-robin over the Vendas team
  SELECT tm.id, tm.user_id INTO selected_member
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.status = 'active'
    AND COALESCE(tm.weight, 0) > 0
    AND tm.user_id IS NOT NULL
    AND t.is_active = true
    AND lower(t.name) = 'vendas'
  ORDER BY (tm.rr_counter::float / tm.weight) ASC, tm.name ASC
  LIMIT 1;

  IF selected_member IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.assigned_user_id := selected_member.user_id;

  UPDATE public.team_members
  SET rr_counter = rr_counter + 1
  WHERE id = selected_member.id;

  RETURN NEW;
END;
$function$;
