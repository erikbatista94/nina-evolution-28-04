
-- Helper multi-tenant
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public' AS $$
  SELECT NULL::uuid;
$$;

-- knowledge_sources
CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid DEFAULT NULL,
  type text NOT NULL DEFAULT 'text',
  title text NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  status text NOT NULL DEFAULT 'draft',
  raw_text text,
  file_path text,
  created_by uuid,
  indexed_at timestamptz,
  last_index_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage knowledge_sources"
  ON public.knowledge_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- knowledge_chunks
CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid DEFAULT NULL,
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage knowledge_chunks"
  ON public.knowledge_chunks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- GIN index for full-text search
CREATE INDEX idx_knowledge_chunks_search ON public.knowledge_chunks USING GIN (search_vector);
CREATE INDEX idx_knowledge_sources_tenant_status ON public.knowledge_sources (tenant_id, status);

-- Auto-generate tsvector trigger
CREATE OR REPLACE FUNCTION public.knowledge_chunks_search_vector_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('portuguese', NEW.content);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_knowledge_chunks_search_vector
  BEFORE INSERT OR UPDATE OF content ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_chunks_search_vector_trigger();

-- Updated_at trigger for knowledge_sources
CREATE TRIGGER update_knowledge_sources_updated_at
  BEFORE UPDATE ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- DB function for full-text search (used by knowledge-search edge function)
CREATE OR REPLACE FUNCTION public.search_knowledge(p_query text, p_tenant_id uuid DEFAULT NULL, p_top_k integer DEFAULT 5)
RETURNS TABLE(title text, category text, content text, source_id uuid, chunk_index integer, rank real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT ks.title, ks.category, kc.content, kc.source_id, kc.chunk_index,
         ts_rank_cd(kc.search_vector, websearch_to_tsquery('portuguese', p_query))::real AS rank
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks ON ks.id = kc.source_id
  WHERE ks.status = 'published'
    AND (ks.tenant_id IS NULL OR ks.tenant_id = p_tenant_id)
    AND kc.search_vector @@ websearch_to_tsquery('portuguese', p_query)
  ORDER BY rank DESC
  LIMIT p_top_k;
END;
$$;

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-files', 'knowledge-files', false);

-- Storage RLS: admin-only
CREATE POLICY "Admins can upload knowledge files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read knowledge files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete knowledge files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-files' AND public.has_role(auth.uid(), 'admin'));
