

## Plano: Corrigir Google Calendar + Bug SLA-Checker

Encontrei 2 problemas durante a auditoria:

### Problema 1 — Google Calendar sem logs (não está sendo chamado)

A edge function `google-calendar` não tem nenhum log, o que indica que as chamadas estão falhando antes de chegar ao código. A causa provável é que `verify_jwt` não está configurado como `false` no `config.toml`, e a função não faz validação interna de JWT. Conforme o memory do projeto, todas as edge functions precisam de `verify_jwt = false`.

**Correção:**
- Adicionar bloco `[functions.google-calendar]` no `supabase/config.toml` com `verify_jwt = false`
- Redeployar a função

### Problema 2 — SLA-Checker UPSERT falhando (bug crítico em produção)

Os logs mostram dezenas de erros: `"there is no unique or exclusion constraint matching the ON CONFLICT specification"`. O index parcial `idx_sla_alerts_unique_open` existe (`WHERE resolved = false`), mas o Supabase JS client não suporta partial unique indexes no `onConflict` — o PostgreSQL não consegue fazer match.

**Correção:**
- No `sla-checker/index.ts`, trocar o `upsert` por lógica de check-then-insert:
  1. Verificar se já existe alerta aberto para `(conversation_id, level, resolved=false)`
  2. Se existe: update `updated_at` + `last_client_message_at` + `suggested_message`
  3. Se não existe: insert novo alerta

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/config.toml` | Adicionar `verify_jwt = false` para `google-calendar` |
| `supabase/functions/sla-checker/index.ts` | Trocar upsert por check-then-insert para funcionar com partial unique index |

### Checklist de teste
1. Criar agendamento na UI → verificar se aparece no Google Calendar
2. Clicar "Sincronizar" → verificar se eventos do GCal aparecem localmente
3. Verificar nos logs da edge function que `google-calendar` agora executa
4. Verificar que `sla-checker` para de gerar erros de ON CONFLICT

