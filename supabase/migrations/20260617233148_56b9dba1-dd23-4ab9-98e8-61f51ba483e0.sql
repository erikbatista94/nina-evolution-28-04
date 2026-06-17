
-- Fix demo agent access: assign company + user role
UPDATE public.team_members
SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001'
WHERE user_id = '764d5d3c-33d6-4f8b-af8e-a5775c126e84';

INSERT INTO public.user_roles (user_id, role, company_id)
VALUES ('764d5d3c-33d6-4f8b-af8e-a5775c126e84', 'user', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
