UPDATE public.team_members
SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001'
WHERE user_id = 'f30d3863-1b2b-4e7a-9e31-4a2058e8ab0d'
  AND company_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;