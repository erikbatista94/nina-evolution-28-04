

## Plano: Integração Nina + Google Calendar + Sistema Inteligente de Agendamentos

Este é um projeto muito grande. Vou dividir em fases implementáveis.

---

### Pré-requisito: Credenciais Google Calendar

O Google Calendar API requer 4 credenciais que o admin precisa fornecer:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`  
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`

Essas serão armazenadas na tabela `nina_settings` (campos novos) e acessíveis via edge functions.

---

### Fase 1: Database Migration

```sql
-- Google Calendar config na nina_settings
ALTER TABLE public.nina_settings 
  ADD COLUMN google_client_id text NULL,
  ADD COLUMN google_client_secret text NULL,
  ADD COLUMN google_refresh_token text NULL,
  ADD COLUMN google_calendar_id text NULL,
  ADD COLUMN default_visit_duration integer NOT NULL DEFAULT 90,
  ADD COLUMN available_time_slots jsonb NOT NULL DEFAULT '["08:00","09:30","11:00","13:00","14:30","16:00"]'::jsonb;

-- Google Calendar email por vendedor
ALTER TABLE public.team_members ADD COLUMN google_calendar_email text NULL;

-- Endereço do contato
ALTER TABLE public.contacts ADD COLUMN address_full text NULL;

-- Google Event ID no appointment
ALTER TABLE public.appointments 
  ADD COLUMN google_event_id text NULL,
  ADD COLUMN google_sync_status text NULL DEFAULT 'local';
```

---

### Fase 2: Correção do Bug do Modal de Agendamento (Parte 1)

**`src/components/Scheduling.tsx`**: Os modais já usam `fixed inset-0 z-50`. O problema é provavelmente stacking context do pai. Solução:
- Renderizar modais via `createPortal(modal, document.body)` do React
- Aumentar z-index para `z-[9999]`
- Adicionar handler de ESC e click-outside
- Garantir que o `overflow-hidden` do layout não bloqueie

---

### Fase 3: Campo `google_calendar_email` no /team (Parte 2)

**`src/components/Team.tsx`**: Adicionar campo no formulário de criar/editar membro. Admin only.

**`src/services/api.ts`**: Incluir `google_calendar_email` nos fetches/updates de team_members.

**`src/types.ts`**: Adicionar `google_calendar_email?: string | null` ao `TeamMember`.

---

### Fase 4: Configuração Google Calendar no Settings (Parte 3)

**`src/components/settings/ApiSettings.tsx`**: Nova seção "Google Calendar" com:
- Client ID, Client Secret (password fields)
- Refresh Token (password field)
- Calendar ID
- Duração padrão (select: 60/90/120 min)
- Horários disponíveis (chips editáveis)
- Botão "Testar Conexão" que chama edge function

Salvar/carregar dos novos campos de `nina_settings`.

---

### Fase 5: Edge Functions Google Calendar (Partes 4, 5, 7, 12)

#### `supabase/functions/google-calendar/index.ts`

Edge function central com actions:

1. **`check-availability`**: Usa `freebusy.query` do Google Calendar API para retornar slots livres para uma data. Compara com `available_time_slots` e `default_visit_duration`.

2. **`create-event`**: Cria evento no Google Calendar com título formatado `NomeVendedor: Visita - NomeCliente - Endereço`. Retorna `google_event_id`.

3. **`sync-events`**: Lista eventos do Google Calendar para um período e sincroniza com tabela `appointments` (upsert por `google_event_id`). Remove eventos deletados no Google.

4. **`test-connection`**: Valida as credenciais fazendo uma chamada simples ao Calendar API.

**Autenticação Google**: Usar refresh_token para obter access_token via `https://oauth2.googleapis.com/token` antes de cada chamada.

---

### Fase 6: Criação de Agendamento com Google Calendar (Parte 5)

**`src/components/Scheduling.tsx`**: Ao criar appointment:
1. Chamar edge function `google-calendar` action `create-event`
2. Salvar `google_event_id` no appointment
3. Formato do título: `${vendedor}: Visita - ${cliente} - ${endereço}`

**`src/services/api.ts`**: Atualizar `createAppointment` para aceitar `google_event_id`, `address`.

---

### Fase 7: Endereço Automático (Parte 6)

**`src/components/Scheduling.tsx`**: No modal de criação, campo endereço com auto-preenchimento:
1. Se contato selecionado tem `address_full` → preencher
2. Se `client_memory` tem endereço detectado → sugerir
3. Campo editável manualmente

**`src/components/ChatInterface.tsx`**: No painel do lead, campo `address_full` editável.

---

### Fase 8: Sincronização e Visualização (Partes 7, 12)

**`src/components/Scheduling.tsx`**: 
- Ao carregar, chamar `google-calendar` action `sync-events` para o período visível
- Exibir badge "Google" em eventos sincronizados do Google
- Polling periódico ou sync manual via botão "Sincronizar"

---

### Fase 9: Ação Rápida "Ver Horários" no Chat (Parte 8)

**`src/components/ChatInterface.tsx`**: 
- Botão "Ver horários disponíveis" no painel lateral
- Ao clicar: chama edge function `check-availability` para próximos 3 dias úteis
- Exibe slots livres em dropdown
- Ao selecionar: abre modal de confirmação de agendamento (pré-preenchido com contato e horário)

---

### Fase 10: Detecção de Intenção pela IA (Parte 9)

**`supabase/functions/nina-orchestrator/index.ts`**: Já existe sistema de tools (scheduling). Adicionar tool `check_google_calendar_availability` que consulta a edge function. Quando a IA detectar intenção de agendamento, ela sugere horários reais do Google Calendar ao invés de criar direto.

---

### Fase 11: Tratamento de Erros (Parte 13)

Na edge function `google-calendar`:
- Token expirado → retry com refresh
- Erro de auth → mensagem clara "Credenciais do Google Calendar inválidas"
- Conflito de horário → retornar slots alternativos
- Falha de sync → log + toast no frontend

---

### Arquivos alterados (resumo)

| Arquivo | Mudança |
|---|---|
| Migration SQL | 4 ALTERs (nina_settings, team_members, contacts, appointments) |
| `supabase/functions/google-calendar/index.ts` | Nova edge function central |
| `src/components/Scheduling.tsx` | Portal nos modais, integração GCal, campo endereço, sync |
| `src/components/settings/ApiSettings.tsx` | Seção Google Calendar |
| `src/components/ChatInterface.tsx` | Botão "Ver horários", campo endereço |
| `src/components/Team.tsx` | Campo google_calendar_email |
| `src/services/api.ts` | Novos campos nos CRUDs |
| `src/types.ts` | Novos campos nos types |
| `supabase/functions/nina-orchestrator/index.ts` | Tool de availability via GCal |

### Ordem de implementação sugerida

1. Migration + types
2. Bug do modal (portal)
3. Campo google_calendar_email no /team
4. Seção Google Calendar no Settings
5. Edge function google-calendar
6. Integração criação de appointment + GCal
7. Sync + visualização
8. Ação rápida no chat
9. IA com availability check
10. Tratamento de erros

