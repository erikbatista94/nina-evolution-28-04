-- RLS multi-tenant para deals, pipeline_stages e appointments
-- deals: super_admin vê tudo, admin vê company, member vê os seus
DROP POLICY IF EXISTS "Allow all operations on deals" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can access all deals" ON public.deals;
DROP POLICY IF EXISTS "deals_policy" ON public.deals;

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_policy" ON public.deals FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      company_id = public.my_company_id()
      AND (
        public.has_role(auth.uid(), 'admin')
        OR user_id = auth.uid()
      )
    )
  )
  WITH CHECK (public.is_super_admin() OR company_id = public.my_company_id());

-- pipeline_stages: todos da empresa veem, só admin cria/edita
DROP POLICY IF EXISTS "Allow all operations on pipeline_stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Authenticated users can access all pipeline_stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages_policy" ON public.pipeline_stages;

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_policy" ON public.pipeline_stages FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.company_id IS NOT NULL
      )
    )
  )
  WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'));

-- appointments: super_admin vê tudo, admin vê company, member vê os seus
DROP POLICY IF EXISTS "Allow all operations on appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can access all appointments" ON public.appointments;
DROP POLICY IF EXISTS "appointments_policy" ON public.appointments;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_policy" ON public.appointments FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      company_id = public.my_company_id()
      AND (
        public.has_role(auth.uid(), 'admin')
        OR user_id = auth.uid()
      )
    )
  )
  WITH CHECK (public.is_super_admin() OR company_id = public.my_company_id());
