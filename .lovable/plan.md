

## Plano: Base de Conhecimento (KB) — Admin + IA only

### Resumo dos 3 Ajustes

1. **IA bypass RLS**: `knowledge-search` usa `SUPABASE_SERVICE_ROLE_KEY` (service role client). `nina-orchestrator` chama `knowledge-search` via HTTP, nunca lê tabelas KB diretamente.
2. **Full-text search correto**: `websearch_to_tsquery('portuguese', query)` + `ts_rank_cd` + trigger com `to_tsvector('portuguese', content)`.
3. **Multi-tenant preparado**: coluna `tenant_id UUID DEFAULT NULL`, helper `current_tenant_id()` retornando NULL. Filtros usam `(tenant_id IS NULL OR tenant_id = current_tenant_id())`.

---

### 1. Migration SQL

```sql
-- Helper multi-tenant
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public' AS $$
  SELECT NULL::uuid;  -- single-tenant: returns NULL
$$;

-- knowledge_sources
CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid DEFAULT NULL,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','file')),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
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

CREATE POLICY "Admins can read knowledge_chunks"
  ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

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
```

Storage bucket `knowledge-files` (private) created via migration:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-files', 'knowledge-files', false);
```

RLS on storage: admin-only upload/read for `knowledge-files` bucket.

---

### 2. Edge Function: `knowledge-index`

**Path**: `supabase/functions/knowledge-index/index.ts`

- Receives `{ source_id }` via POST
- Uses **service role** client
- Loads the `knowledge_sources` row
- If `type='text'`: uses `raw_text`
- If `type='file'`: downloads from `knowledge-files` bucket, extracts text (PDF basic parsing / TXT direct)
- Chunks at ~800 chars with ~120 overlap
- Deletes old chunks for that `source_id`, inserts new ones (trigger auto-generates `search_vector`)
- Updates `indexed_at` or `last_index_error`

Config: `verify_jwt = false` (called internally by admin UI with auth header, validated in code).

---

### 3. Edge Function: `knowledge-search`

**Path**: `supabase/functions/knowledge-search/index.ts`

- Receives `{ query, tenant_id?, top_k? }` via POST
- Uses **`SUPABASE_SERVICE_ROLE_KEY`** to bypass RLS (this is the IA access path)
- Executes raw SQL via `supabase.rpc()` or direct query:
  ```sql
  SELECT ks.title, ks.category, kc.content, kc.chunk_index,
         ts_rank_cd(kc.search_vector, websearch_to_tsquery('portuguese', $1)) AS rank
  FROM knowledge_chunks kc
  JOIN knowledge_sources ks ON ks.id = kc.source_id
  WHERE ks.status = 'published'
    AND (ks.tenant_id IS NULL OR ks.tenant_id = $2)
    AND kc.search_vector @@ websearch_to_tsquery('portuguese', $1)
  ORDER BY rank DESC
  LIMIT $3
  ```
- Returns top chunks with title, category, content, rank
- No auth check needed (called internally by orchestrator with service role)

Config: `verify_jwt = false`.

We'll create a DB function `search_knowledge(p_query text, p_tenant_id uuid, p_top_k int)` to encapsulate the search and call it via `supabase.rpc('search_knowledge', ...)`.

---

### 4. `nina-orchestrator/index.ts` — KB injection

In `processQueueItem`, **before** building the AI request body (around line 726-757):

1. Call `knowledge-search` via internal HTTP:
   ```ts
   const kbResponse = await fetch(`${supabaseUrl}/functions/v1/knowledge-search`, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${supabaseServiceKey}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({ query: message.content, top_k: 5 })
   });
   ```
2. If results exist, build a KB block (max 2500 chars):
   ```
   [BASE DE CONHECIMENTO DA EMPRESA - FONTE PRIORITÁRIA]
   - (Título | Categoria) Trecho...
   [REGRAS]
   - Use esses trechos como fonte confiável.
   - Se não houver trechos relevantes, não invente.
   ```
3. Append to `processedPrompt` before sending to AI.

---

### 5. UI: `AgentSettings.tsx` — Seção KB (admin-only)

Add a collapsible section "Base de Conhecimento" at the bottom of AgentSettings, visible only when `useCompanySettings().isAdmin` is true.

Features:
- List of `knowledge_sources` with status badges (Indexado/Erro/Pendente)
- Search + filter by category and status
- Create/Edit modal: title, category, status (draft/published), type selector (text/file)
- For text: textarea editor
- For file: file upload to `knowledge-files` bucket
- Actions: Publish/Unpublish, Reindex (calls `knowledge-index`), Delete
- On publish: auto-triggers indexing

Vendedores see nothing (section not rendered). Since Settings is already behind `AdminRoute`, the route guard is inherited.

---

### 6. `supabase/config.toml` updates

```toml
[functions.knowledge-index]
verify_jwt = false

[functions.knowledge-search]
verify_jwt = false
```

---

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Migration SQL | Tabelas, função `current_tenant_id()`, `search_knowledge()`, trigger tsvector, bucket |
| `supabase/functions/knowledge-index/index.ts` | Nova: ingestão + chunking |
| `supabase/functions/knowledge-search/index.ts` | Nova: busca full-text via service role |
| `supabase/functions/nina-orchestrator/index.ts` | Injetar KB no prompt (~20 linhas em `processQueueItem`) |
| `src/components/settings/AgentSettings.tsx` | Seção KB admin-only com CRUD completo |
| `supabase/config.toml` | Registrar 2 novas functions |

### Segurança confirmada

- Vendedor: RLS bloqueia SELECT em `knowledge_sources` e `knowledge_chunks`. UI não renderiza seção. Route já é `AdminRoute`.
- IA: `knowledge-search` usa service role key, bypassa RLS. Chamada interna do orchestrator.
- Nenhum endpoint expõe KB para vendedor (edge functions internas, sem chamada do frontend por vendedor).

### Checklist de testes

1. Login admin → Agente → criar item KB com texto "A empresa foi fundada em 2010 e tem 15 anos de experiência" → Publicar → ver badge "Indexado ✅"
2. Simular mensagem WhatsApp: "Há quantos anos a empresa existe?" → IA deve responder usando KB
3. Simular: "Quais serviços vocês oferecem?" (sem KB relevante) → IA não inventa, pede clarificação
4. Login como vendedor → Agente → seção KB não aparece
5. Vendedor tenta query direta em `knowledge_sources` → RLS bloqueia

### Rollback

```sql
DROP TABLE IF EXISTS public.knowledge_chunks;
DROP TABLE IF EXISTS public.knowledge_sources;
DROP FUNCTION IF EXISTS public.current_tenant_id();
DROP FUNCTION IF EXISTS public.knowledge_chunks_search_vector_trigger();
DROP FUNCTION IF EXISTS public.search_knowledge(text, uuid, integer);
DELETE FROM storage.buckets WHERE id = 'knowledge-files';
```
Remover edge functions `knowledge-index` e `knowledge-search`, reverter alterações no orchestrator e AgentSettings.

