
INSERT INTO public.user_roles (user_id, role, company_id)
VALUES ('713d2328-f16d-4109-9f9e-50f693fabf1a', 'admin', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (user_id, role) DO UPDATE SET company_id = EXCLUDED.company_id;

INSERT INTO public.profiles (user_id, full_name, force_password_change)
VALUES ('713d2328-f16d-4109-9f9e-50f693fabf1a', 'Demo Apresentação', false)
ON CONFLICT (user_id) DO UPDATE SET force_password_change = false;

UPDATE public.team_members
SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001'
WHERE user_id = '713d2328-f16d-4109-9f9e-50f693fabf1a' AND company_id IS NULL;
