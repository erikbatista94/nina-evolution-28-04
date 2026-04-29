
-- 2. TABELA: companies
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  plan TEXT NOT NULL DEFAULT 'basic',
  max_instances INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  billing_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON public.companies(is_active);

-- 3. TABELA: instances
CREATE TABLE IF NOT EXISTS public.instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  evolution_api_url TEXT NOT NULL,
  evolution_api_key TEXT NOT NULL,
  evolution_instance TEXT NOT NULL,
  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  last_connected_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instances_company_id ON public.instances(company_id);
CREATE INDEX IF NOT EXISTS idx_instances_user_id ON public.instances(user_id);
CREATE INDEX IF NOT EXISTS idx_instances_evolution_instance ON public.instances(evolution_instance);

-- 4. company_id NAS TABELAS EXISTENTES
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON public.contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_company_id ON public.conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON public.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_nina_settings_company_id ON public.nina_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_company_id ON public.team_members(company_id);
CREATE INDEX IF NOT EXISTS idx_teams_company_id ON public.teams(company_id);

-- 6. Empresa Gesso Gilmar
INSERT INTO public.companies (id, name, slug, max_instances, is_active, notes)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Gesso Gilmar',
  'gesso-gilmar',
  5,
  true,
  'Primeiro cliente - conta de teste'
) ON CONFLICT (slug) DO NOTHING;

-- 7. Associar dados existentes
UPDATE public.contacts SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.conversations SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.deals SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.nina_settings SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.team_members SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.teams SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.appointments SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.whatsapp_templates SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.user_roles SET company_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE company_id IS NULL AND role::text != 'super_admin';

-- 8. Migrar instância atual
INSERT INTO public.instances (company_id, name, evolution_api_url, evolution_api_key, evolution_instance, is_active)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Instância Principal',
  evolution_api_url,
  evolution_api_key,
  evolution_instance,
  true
FROM public.nina_settings
WHERE evolution_instance IS NOT NULL
  AND evolution_api_url IS NOT NULL
  AND evolution_api_key IS NOT NULL
  AND company_id = 'aaaaaaaa-0000-0000-0000-000000000001'
LIMIT 1;

-- 9. FUNÇÕES de autorização
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
      AND role::text = 'super_admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT company_id FROM public.user_roles
    WHERE user_id = auth.uid()
      AND company_id IS NOT NULL
    LIMIT 1
  );
END;
$$;

-- 10. RLS companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "companies_policy" ON public.companies;
CREATE POLICY "companies_policy" ON public.companies FOR ALL TO authenticated
  USING (public.is_super_admin() OR id = public.my_company_id())
  WITH CHECK (public.is_super_admin());

-- 11. RLS instances
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "instances_policy" ON public.instances;
CREATE POLICY "instances_policy" ON public.instances FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.my_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.my_company_id());

-- 12. RLS contacts
DROP POLICY IF EXISTS "Allow all operations on contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can access all contacts" ON public.contacts;
DROP POLICY IF EXISTS "contacts_policy" ON public.contacts;
CREATE POLICY "contacts_policy" ON public.contacts FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      company_id = public.my_company_id()
      AND (
        public.has_role(auth.uid(), 'admin')
        OR EXISTS (
          SELECT 1 FROM public.conversations c
          WHERE c.contact_id = contacts.id
            AND c.assigned_user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (public.is_super_admin() OR company_id = public.my_company_id());

-- 13. RLS conversations
DROP POLICY IF EXISTS "Allow all operations on conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can access all conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_policy" ON public.conversations;
CREATE POLICY "conversations_policy" ON public.conversations FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      company_id = public.my_company_id()
      AND (
        public.has_role(auth.uid(), 'admin')
        OR assigned_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (public.is_super_admin() OR company_id = public.my_company_id());

-- 14. RLS messages
DROP POLICY IF EXISTS "Allow all operations on messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can access all messages" ON public.messages;
DROP POLICY IF EXISTS "messages_policy" ON public.messages;
CREATE POLICY "messages_policy" ON public.messages FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.company_id = public.my_company_id()
        AND (
          public.has_role(auth.uid(), 'admin')
          OR c.assigned_user_id = auth.uid()
        )
    )
  )
  WITH CHECK (true);

-- 15. RLS nina_settings
DROP POLICY IF EXISTS "Admins can modify nina_settings" ON public.nina_settings;
DROP POLICY IF EXISTS "Authenticated can read nina_settings" ON public.nina_settings;
DROP POLICY IF EXISTS "nina_settings_policy" ON public.nina_settings;
CREATE POLICY "nina_settings_policy" ON public.nina_settings FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.my_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.my_company_id());

-- 16. RLS teams e team_members
DROP POLICY IF EXISTS "Admins can modify teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated can read teams" ON public.teams;
DROP POLICY IF EXISTS "teams_policy" ON public.teams;
CREATE POLICY "teams_policy" ON public.teams FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.my_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.my_company_id());

DROP POLICY IF EXISTS "Admins can modify team_members" ON public.team_members;
DROP POLICY IF EXISTS "Authenticated can read team_members" ON public.team_members;
DROP POLICY IF EXISTS "team_members_policy" ON public.team_members;
CREATE POLICY "team_members_policy" ON public.team_members FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.my_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.my_company_id());

-- 17. TRIGGERS
DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_instances_updated_at ON public.instances;
CREATE TRIGGER update_instances_updated_at
  BEFORE UPDATE ON public.instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 18. REALTIME
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.instances;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
