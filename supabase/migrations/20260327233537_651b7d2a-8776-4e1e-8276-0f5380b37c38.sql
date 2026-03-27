
-- Block 2: objections_playbook table
CREATE TABLE public.objections_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  triggers TEXT[] NOT NULL DEFAULT '{}',
  response_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.objections_playbook ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage playbook" ON public.objections_playbook FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Auth read playbook" ON public.objections_playbook FOR SELECT TO authenticated USING (true);

-- Block 3: lead_score + scoring_weights
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;

ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS scoring_weights JSONB DEFAULT '{
  "arquiteto": 20, "designer": 15, "empresa": 15, "construtora": 20, "cliente_final": 5,
  "imediato": 25, "30d": 15, "60d": 10, "90d": 5,
  "area_100_plus": 15, "has_project": 10,
  "campinas": 10, "alphaville": 10
}'::jsonb;

-- Block 4: deals extra columns + proposals table with proper RLS
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS conditions TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS proposal_status TEXT DEFAULT 'none';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS proposal_file_path TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ;

CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- Vendor can only access proposals for their own deals
CREATE POLICY "Vendors access own deal proposals" ON public.proposals FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM deals WHERE deals.id = proposals.deal_id AND deals.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM deals WHERE deals.id = proposals.deal_id AND deals.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
