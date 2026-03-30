## Plano: Bug Status + 5 Melhorias Estratégicas

### Status: ✅ Implementado (Partes 1-4, 6)

### Parte 1 — Bug de Status ✅
**Hipótese validada**: Race condition no sender — `whatsapp_message_id` salvo após envio (linha 434-451), mas webhook de status chega antes.
**Correção**: Retry com delay (2.5s, até 3 tentativas) no `whatsapp-webhook` quando `UPDATE ... WHERE whatsapp_message_id=X` retorna 0 rows.
**Logs**: `[Webhook] No message found for WA ID X, retrying...` e `[Webhook] Status DROPPED` quando falha após 3 tentativas.

### Parte 2 — Radar de Gaps ✅
**Regra**: Gaps só detectados após `interactionCount >= 3` (configurável via `GAP_MIN_INTERACTIONS`).
**Categorias**: `missing` (campo não informado), `vague` (resposta vaga detectada por padrões), `contradictory` (futuro).
**Campos monitorados**: city, customer_type, interest_services, job_size, has_project.
**UI**: Bloco "⚠ Informações Pendentes" no sidebar do chat.

### Parte 3 — Retomada Inteligente ✅
**Classificação**: `sem_retorno`, `sem_retorno_orcamento`, `aguardando_medidas`, `aguardando_decisao`, `interesse_sem_avanco`, `lead_abandonado`.
**Mensagens sugeridas**: contextuais por stall_reason.
**Followup só criado após 24h** de inatividade.

### Parte 4 — Controle de Dono ✅
**Tabela**: `conversation_ownership_log` (action: assumed/transferred).
**Campos**: `conversations.human_status`, `conversations.last_human_interaction_at`.
**RLS**: Admin vê tudo, vendedor vê apenas logs onde é user_id ou previous_user_id.

### Parte 5 — Painel de Qualidade
**Status**: Pendente (próxima iteração). Dados base já disponíveis via `conversation_events`.
**Regra de lead qualificado**: mínimo 3 campos preenchidos (city + customer_type + interest_services) + lead_score >= 40.

### Parte 6 — Aprendizado Contínuo ✅
**Tabela**: `conversation_events` com índices em conversation_id, contact_id, event_type, created_at.
**Eventos logados**: analyzed, qualified, high_score, stage_moved, won, lost, stalled, human_takeover, transferred.
**RLS**: Somente admin lê.

### Migration aplicada
- `contacts.qualification_gaps` (JSONB)
- `followup_tasks`: stall_reason, attempt_count, result, history
- `conversations`: human_status, last_human_interaction_at
- `conversation_ownership_log` (nova tabela + RLS)
- `conversation_events` (nova tabela + RLS + 4 índices)
- `idx_followup_unique_pending` (unique index)

### Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `supabase/functions/whatsapp-webhook/index.ts` | Retry com delay para status updates (race condition fix) |
| `supabase/functions/whatsapp-sender/index.ts` | Já salva whatsapp_message_id antes de outros processos |
| `supabase/functions/analyze-conversation/index.ts` | Qualification gaps + conversation_events logging |
| `supabase/functions/followup-checker/index.ts` | Stall reason classification + contextual messages |
| `src/services/api.ts` | Ownership log + events em assignConversation, markDealWon, markDealLost |
| `src/components/ChatInterface.tsx` | Bloco "Informações Pendentes" + qualification_gaps no select |
| Migration SQL | 5 alterações de schema + 2 tabelas novas + índices |
