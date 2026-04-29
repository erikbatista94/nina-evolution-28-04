
CREATE OR REPLACE FUNCTION public.set_company_id_from_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO v_company
      FROM public.user_roles
     WHERE user_id = auth.uid()
       AND company_id IS NOT NULL
     LIMIT 1;
    IF v_company IS NOT NULL THEN
      NEW.company_id := v_company;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Conversation: herda do contato se possível, senão do usuário
CREATE OR REPLACE FUNCTION public.set_conversation_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  IF NEW.company_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.contacts WHERE id = NEW.contact_id;
    IF v_company IS NOT NULL THEN
      NEW.company_id := v_company;
    END IF;
  END IF;
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO v_company
      FROM public.user_roles
     WHERE user_id = auth.uid()
       AND company_id IS NOT NULL
     LIMIT 1;
    IF v_company IS NOT NULL THEN
      NEW.company_id := v_company;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_id ON public.contacts;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

DROP TRIGGER IF EXISTS trg_set_company_id ON public.conversations;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_conversation_company_id();

DROP TRIGGER IF EXISTS trg_set_company_id ON public.deals;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

DROP TRIGGER IF EXISTS trg_set_company_id ON public.appointments;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

DROP TRIGGER IF EXISTS trg_set_company_id ON public.team_members;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

DROP TRIGGER IF EXISTS trg_set_company_id ON public.teams;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();
