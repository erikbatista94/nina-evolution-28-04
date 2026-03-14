

## Plano: Contatos CRM com Campos Estruturados, Filtros e Tags Automáticas

### Decisão de Arquitetura: Colunas vs JSONB

**Colunas dedicadas** — os campos de qualificação serão adicionados como colunas reais na tabela `contacts`. Motivos:
- Filtros SQL com `WHERE` direto (sem `->>`/`@>` em JSONB)
- Indexação nativa para performance
- Tipagem forte no TypeScript via types.ts auto-gerado
- O `client_memory` JSONB continua existindo para dados livres/histórico — os campos estruturados são a "projeção" filtável

### Mudanças

#### 1. Migration: Adicionar colunas CRM ao `contacts`

```sql
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS customer_type text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS interest_services text[] DEFAULT '{}';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_size text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS has_project boolean;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS start_timeframe text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_temperature text DEFAULT 'frio';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'novo';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS next_best_action text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_id uuid;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz DEFAULT now();
```

Nota: `assigned_user_id` e `last_interaction_at` permitem filtrar diretamente no contato sem join com conversations.

#### 2. Edge Function `analyze-conversation/index.ts` — Sincronizar campos estruturados

Após atualizar `client_memory`, adicionar um `UPDATE contacts SET ...` que projeta os insights extraídos pela IA para as colunas estruturadas:
- `qualification_score` → `lead_temperature` (>70 = quente, >40 = morno, else frio)
- `interests` → `interest_services`
- `next_best_action` → `next_best_action`
- `budget_indication`, `decision_timeline` → `start_timeframe`

Adicionar novos campos ao tool call da IA (`update_memory_insights`):
- `customer_type` (enum: arquiteto, cliente_final, engenheiro, construtora, empresa, designer)
- `city`, `neighborhood`
- `job_size` (pequena, media, grande)
- `has_project` (boolean)
- `lead_status` (novo, qualificando, qualificado, agendado, perdido, ganho)
- `source` (indicação, google, instagram, whatsapp, outro)

#### 3. `src/types.ts` — Expandir interface Contact

Adicionar todos os novos campos ao tipo `Contact` para uso no frontend.

#### 4. `src/services/api.ts` — fetchContacts expandido

- Retornar todos os novos campos do `select('*')`
- Mapear `lead_temperature`, `lead_status`, `customer_type`, `interest_services`, `city`, `neighborhood`, `job_size`, `has_project`, `start_timeframe`, `source`, `next_best_action`, `assigned_user_id`, `tags`

#### 5. `src/components/Contacts.tsx` — Reescrever como CRM

**Barra de filtros** (substituir o botão desabilitado "Filtros Avançados"):
- Dropdowns: Responsável, Tipo de Cliente, Status, Temperatura, Cidade, Prazo, Com/Sem Projeto
- Multi-select: Serviços de Interesse
- Range: Última Interação (hoje, 7d, 30d, 90d+)

**Tabela expandida**:
- Colunas: Nome/Telefone, Tipo, Serviços (tags), Cidade, Temperatura, Status, Última Interação, Ações
- Tags coloridas inline (geradas dos campos: customer_type, interest_services, city, lead_temperature)
- Badge de temperatura com cores (🔴 quente, 🟡 morno, 🔵 frio)

**Tags automáticas visíveis**:
- Geradas client-side a partir dos campos estruturados (não duplicam no banco)
- Ex: "arquiteto", "drywall", "indaiatuba", "lead_quente"

#### 6. Tags automáticas — lógica de geração

Função utilitária `generateAutoTags(contact)` que retorna array de tags normalizadas:
- `customer_type` → tag (ex: "arquiteto")
- `interest_services` → cada serviço vira tag (ex: "drywall", "forro")
- `city` → tag (ex: "indaiatuba")
- `lead_temperature` → tag (ex: "lead_quente")
- `lead_status` → tag (ex: "qualificado")

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Migration SQL | Adicionar 13 colunas ao `contacts` |
| `supabase/functions/analyze-conversation/index.ts` | Expandir tool call + sync colunas estruturadas |
| `src/types.ts` | Expandir interface `Contact` |
| `src/services/api.ts` | Expandir `fetchContacts` com novos campos |
| `src/components/Contacts.tsx` | Reescrever com filtros, tags, tabela expandida |

### Como testar

1. Enviar mensagem simulada de um lead novo (simulate-webhook)
2. Responder perguntas de qualificação na conversa
3. Após 5 interações (trigger de análise completa), verificar na tela Contatos que os campos foram preenchidos
4. Testar filtros: filtrar por temperatura "quente", por serviço "drywall", etc.
5. Verificar que tags automáticas aparecem no contato

### Rollback

- Migration reversa: `ALTER TABLE contacts DROP COLUMN IF EXISTS ...` para cada coluna
- Reverter arquivos editados ao commit anterior

