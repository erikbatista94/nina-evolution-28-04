
-- 1. Recria função de round-robin com filtro pelo time "Vendas"
CREATE OR REPLACE FUNCTION public.assign_conversation_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  selected_member RECORD;
BEGIN
  -- Não sobrescreve se já vier atribuído
  IF NEW.assigned_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Elegibilidade: ativo, peso > 0, com user_id, no time Vendas ativo
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

-- 2. RPC para reatribuir on-demand uma conversa existente sem assigned_user_id
CREATE OR REPLACE FUNCTION public.assign_conversation_now(p_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  selected_member RECORD;
  current_assigned uuid;
BEGIN
  SELECT assigned_user_id INTO current_assigned
  FROM public.conversations
  WHERE id = p_conversation_id;

  IF current_assigned IS NOT NULL THEN
    RETURN current_assigned;
  END IF;

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
    RETURN NULL;
  END IF;

  UPDATE public.conversations
  SET assigned_user_id = selected_member.user_id
  WHERE id = p_conversation_id
    AND assigned_user_id IS NULL;

  UPDATE public.team_members
  SET rr_counter = rr_counter + 1
  WHERE id = selected_member.id;

  RETURN selected_member.user_id;
END;
$function$;

-- 3. Corrigir peso do Lucas Braga (estava 0, devolver à fila)
UPDATE public.team_members
SET weight = 1
WHERE email = 'lucas@gessogilmar.com.br'
  AND COALESCE(weight, 0) = 0;
