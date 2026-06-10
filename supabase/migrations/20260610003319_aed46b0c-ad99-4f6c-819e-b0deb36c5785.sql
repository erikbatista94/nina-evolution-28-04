
DO $$
DECLARE
  default_company UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
BEGIN
  UPDATE public.contacts        SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.deals           SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.conversations   SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.appointments    SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.team_members    SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.teams           SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.user_roles      SET company_id = default_company WHERE company_id IS NULL AND role::text <> 'super_admin';
END $$;

ALTER TABLE public.deals         ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.appointments  ALTER COLUMN company_id SET NOT NULL;
