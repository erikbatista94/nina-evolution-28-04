

## Plano: SLA de Atendimento + Alertas (com 4 ajustes incorporados)

### 1. Migration — Tabela `sla_alerts`

```sql
CREATE TYPE sla_level AS ENUM ('respond_now', 'loss_risk', 'stalled');

CREATE TABLE public.sla_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_user_id UUID,
  level sla_level NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  suggested_message TEXT,
  last_client_message_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sla_alerts ENABLE ROW LEVEL SECURITY;

-- Unique parcial: evita duplicação de alertas abertos
CREATE UNIQUE INDEX idx_sla_alerts_unique_open
  ON public.sla_alerts (conversation_id, level)
  WHERE resolved = false;

-- SELECT: vendedor vê os dele, admin vê tudo
CREATE POLICY "Users can select own alerts"
  ON public.sla_alerts FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- UPDATE: vendedor só pode resolver os dele (resolved=true)
CREATE POLICY "Users can resolve own alerts"
  ON public.sla_alerts FOR UPDATE TO authenticated
  USING (assigned_user_id = auth.uid())
  WITH CHECK (resolved = true);

-- INSERT/DELETE: somente service role (sem policy = bloqueado para authenticated)
-- Edge functions usam service role, que bypassa RLS

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sla_alerts;
```

**Ajuste 1**: Sem policy FOR ALL. INSERT/UPDATE/DELETE bloqueados para usuários normais. Service role (edge functions) bypassa RLS naturalmente.

**Ajuste 2**: `public.has_role(auth.uid(), 'admin')` com schema explícito.

**Ajuste 3**: Unique index parcial `(conversation_id, level) WHERE resolved = false` + UPSERT no checker.

### 2. Edge Function `sla-checker`

Query usa `sent_at` (timestamp real do envio, não `created_at` que é quando o registro foi inserido):

```sql
SELECT c.id, c.contact_id, c.assigned_user_id,
  MAX(m.sent_at) FILTER (WHERE m.from_type = 'user') as last_client_msg,
  MAX(m.sent_at) FILTER (WHERE m.from_type = 'human') as last_human_msg,
  ct.name as contact_name
FROM conversations c
JOIN messages m ON m.conversation_id = c.id
JOIN contacts ct ON ct.id = c.contact_id
WHERE c.is_active = true AND c.status = 'human'
GROUP BY c.id, c.contact_id, c.assigned_user_id, ct.name
HAVING MAX(m.sent_at) FILTER (WHERE m.from_type = 'user') >
       COALESCE(MAX(m.sent_at) FILTER (WHERE m.from_type = 'human'), '1970-01-01')
```

**Ajuste 4**: Usa `sent_at` consistentemente.

Lógica:
- Calcula `diffMinutes` desde `last_client_msg`
- Determina nível: ≥1440min → `stalled`, ≥120min → `loss_risk`, ≥10min → `respond_now`
- UPSERT com `ON CONFLICT (conversation_id, level) WHERE resolved = false DO UPDATE SET updated_at = now()`
- Para `stalled`: gera `suggested_message` = "Olá {nome}, tudo bem? Vi que ficamos sem falar. Posso ajudar?"
- Auto-resolve: marca `resolved = true` onde conversa já tem resposta humana posterior
- Usa service role client (bypassa RLS)

### 3. Hook `useAlerts`

- Query `sla_alerts` WHERE `resolved = false`, ordenado por `level` (stalled > loss_risk > respond_now)
- Subscribe realtime em `sla_alerts`
- Expõe: `alerts[]`, `alertCount`, `resolveAlert(id)` (update `resolved = true`)
- RLS filtra automaticamente por role

### 4. UI

**Sidebar** (`src/components/Sidebar.tsx`):
- Novo item "Alertas" com ícone Bell + badge de contagem
- Badge vermelho se houver alertas `stalled`, amarelo se `loss_risk`/`respond_now`

**Componente `AlertsPanel`** (`src/components/AlertsPanel.tsx`):
- Lista de alertas com cores: vermelho (`stalled`), laranja (`loss_risk`), amarelo (`respond_now`)
- Cada card: nome do contato, tempo sem resposta, nível
- Ações: "Abrir Conversa" (navega para `/chat?conversation=ID`), "Enviar Follow-up" (stalled: abre chat com mensagem sugerida)
- Admin: filtro por vendedor

**Rota**: `/alerts` em `App.tsx`

### 5. Agendamento (pg_cron ou invocação manual)

Configurar chamada periódica (a cada 5 min) via cron ou trigger. A edge function `sla-checker` será invocada com service role.

### Arquivos

| Arquivo | Mudança |
|---|---|
| Migration SQL | Tabela + RLS + unique index + realtime |
| `supabase/functions/sla-checker/index.ts` | Novo: varredura + UPSERT + auto-resolve |
| `src/hooks/useAlerts.ts` | Novo: query + realtime + resolveAlert |
| `src/components/AlertsPanel.tsx` | Novo: UI de alertas |
| `src/components/Sidebar.tsx` | Badge de contagem |
| `src/App.tsx` | Rota `/alerts` |

