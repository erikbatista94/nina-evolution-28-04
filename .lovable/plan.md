# Migração WhatsApp Cloud API (Meta) → Evolution API

Substituir totalmente a integração com a Cloud API da Meta pela Evolution API (self-hosted), mantendo intactos: Equipe/permissões (admin vê tudo, member vê o que é dele), Pipeline, Dashboard, Chat ao Vivo, SLA, Contatos, Agendamentos, Relatórios, FlowCRM, Distribuição, ElevenLabs (apenas troca o transporte do áudio), Google Calendar, IA, Prompt, Base de Conhecimento e Objeções.

## 1. Banco de dados (migration)

Adicionar colunas em `nina_settings` para credenciais Evolution e remover dependência das colunas Meta:

- Adicionar: `evolution_api_url text`, `evolution_api_key text`, `evolution_instance text`, `evolution_webhook_configured boolean default false`, `evolution_connection_status text default 'disconnected'`.
- Manter (mas deixar nullable e descontinuadas, sem uso no código): `whatsapp_access_token`, `whatsapp_phone_number_id`, `whatsapp_verify_token`, `whatsapp_business_account_id` — não dropar para não quebrar a UI antiga até o deploy. Após deploy, dropar em segunda migration.
- Em `messages.metadata` continuamos guardando `whatsapp_message_id` (id da Evolution) — sem mudança de schema.

## 2. Configurações (UI) — `src/components/settings/ApiSettings.tsx`

Remover a seção "WhatsApp Cloud API" (Access Token, Phone Number ID, Verify Token, webhook URL Meta, teste atual).

Criar nova seção "Evolution API":

```text
[ Evolution API ]                ● status: conectado / desconectado / aguardando QR
Base URL *        [https://...]
API Key *         [........]
Instance Name *   [nome-da-instancia]

[ Salvar ]   [ Testar Conexão ]   [ Configurar Webhook ]   [ Conectar / Mostrar QR ]
```

Comportamento:
- Salvar grava em `nina_settings` (campos `evolution_*`).
- Testar Conexão chama nova edge function `evolution-test` que faz `GET {url}/instance/fetchInstances` com header `apikey`.
- Configurar Webhook chama `evolution-configure-webhook` que faz `POST {url}/webhook/set/{instance}` apontando para `{SUPABASE_URL}/functions/v1/whatsapp-webhook` com eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`, `webhook_by_events:true`, `webhook_base64:true`.
- Conectar/Mostrar QR chama `evolution-connect` que faz `GET {url}/instance/connect/{instance}` e exibe o QR base64 retornado num modal.
- Botão "Enviar mensagem de teste" continua existindo, agora chamando `test-whatsapp-message` reescrita para Evolution.

Manter a seção ElevenLabs e a seção Google Calendar exatamente como estão.

## 3. Edge Functions

Reescrever / criar:

- `whatsapp-sender` (reescrita completa)
  - Lê `evolution_api_url`, `evolution_api_key`, `evolution_instance` de `nina_settings` (mesmo fallback global atual).
  - Texto: `POST {url}/message/sendText/{instance}` body `{ number, text }`.
  - Imagem/vídeo/documento: `POST {url}/message/sendMedia/{instance}` com `mediatype`, `media` (URL pública do Storage `whatsapp-media`) e `caption`.
  - Áudio (PTT/ElevenLabs): `POST {url}/message/sendWhatsAppAudio/{instance}` body `{ number, audio: <base64 ogg>, encoding: true }`. Para áudio vindo do Storage, baixar e converter para base64.
  - Header em todas: `apikey: {evolution_api_key}`.
  - `number` = telefone E.164 sem `+` (já temos E.164 nos contatos; remover o `+`).
  - Remover toda a função `uploadMediaToWhatsApp` (não há upload prévio na Evolution).
  - Persistir `whatsapp_message_id` retornado em `messages` igual antes.

- `whatsapp-webhook` (reescrita completa)
  - Remover todo o ramo `GET` com `hub.challenge` / `hub.verify_token` (devolve 405).
  - `POST` agora trata payload Evolution:
    - `event: "messages.upsert"` → cria/atualiza contato e mensagem (ignora `data.key.fromMe === true`). Telefone vem de `data.key.remoteJid` — strip `@s.whatsapp.net` / `@g.us` (ignorar grupos `@g.us`). Texto = `data.message.conversation` ou `data.message.extendedTextMessage.text`. Mídia em `imageMessage`, `audioMessage`, `videoMessage`, `documentMessage` — quando `webhook_base64:true`, baixa de `data.message.base64` e sobe para o bucket `whatsapp-media`. Mantém grouping queue e fast urgency detection idênticos.
    - `event: "messages.update"` → atualiza `messages.status` (`SENT`, `DELIVERED`, `READ`, `PLAYED`) usando `data.key.id` em `whatsapp_message_id`. Mantém retry logic atual.
    - `event: "connection.update"` → atualiza `nina_settings.evolution_connection_status`.
  - Mantém triggers para `message-grouper` e FlowCRM lead sync.

- `send-template` (reescrita)
  - Remove payload `template:{...}` e endpoint Meta.
  - Renderiza `template.content` interpolando `{{var}}` localmente e envia via `POST {url}/message/sendText/{instance}`.
  - Remove qualquer status Meta (`APPROVED/PENDING/REJECTED`).

- `test-whatsapp-message` (reescrita)
  - Envia texto pela Evolution usando as credenciais salvas.

- `simulate-webhook` e `simulate-audio-webhook` (reescritas)
  - Geram payload no formato Evolution e fazem POST para `whatsapp-webhook`.

- `nina-orchestrator` e `message-grouper`
  - Hoje só leem `whatsapp_access_token`/`phone_number_id` para validar configuração antes de enfileirar respostas. Trocar essas validações para checar `evolution_api_url`, `evolution_api_key`, `evolution_instance`. Nenhuma mudança lógica de IA.

- `health-check` e `validate-setup`
  - Substituir checks de `whatsapp_access_token`/`whatsapp_phone_number_id` por checks dos 3 campos Evolution + ping opcional em `/instance/fetchInstances`.

- Novas funções
  - `evolution-test` — `GET /instance/fetchInstances`.
  - `evolution-connect` — `GET /instance/connect/{instance}` retornando QR.
  - `evolution-configure-webhook` — `POST /webhook/set/{instance}`.
  - Todas com `verify_jwt = false` no `supabase/config.toml` (padrão Lovable) e validação de role admin via JWT do chamador antes de executar.

## 4. Templates UI — `src/components/settings/TemplatesManager.tsx`

- Remover qualquer campo/coluna referente a status Meta, namespace, language obrigatório.
- Manter `name`, `display_name`, `content`, `variables`, `is_active`. Deixar `language` apenas como label informativo.

## 5. Dashboard "Status do Sistema" — `src/components/SystemHealthCard.tsx` / `SystemRoadmap.tsx`

- Remover checks `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
- Adicionar checks `evolution_api_url`, `evolution_api_key`, `evolution_instance` + status da conexão (`evolution_connection_status === 'open'`).
- Recalcular percentual.

## 6. Tipos TS

`src/integrations/supabase/types.ts` é regenerado automaticamente após a migration; nada a fazer manualmente. Usar `as any` temporariamente nos novos campos só se a UI compilar antes do refresh do schema.

## 7. O que NÃO é alterado

- Modelo de roles `admin`/`user`, RLS, filtros de visibilidade em `/chat`, `/pipeline`, `/dashboard`, `/reports`.
- Round-robin (`assign_conversation_round_robin`), times, `team_members`.
- ElevenLabs settings/UI (apenas o transporte final do áudio passa pelo `sendWhatsAppAudio`).
- Google Calendar, IA, Objeções, Base de Conhecimento, FlowCRM, SLA, Contatos, Agendamentos.

## 8. Detalhes técnicos

- Headers Evolution: `apikey: <key>` e `Content-Type: application/json`.
- `number` sempre normalizado: strip `+`, `@s.whatsapp.net`, `@g.us`, espaços. Grupos (`@g.us`) ignorados no webhook.
- Áudio: Evolution aceita base64 OGG/Opus em `sendWhatsAppAudio`. Quando o áudio vem do Storage (ElevenLabs), baixar bytes e converter via `encode` de `std/encoding/base64.ts` (nunca `btoa(String.fromCharCode(...))`).
- Webhooks com `webhook_by_events:true` chegam no mesmo endpoint com o tipo dentro de `event`. Manter um `switch(event)`.
- Sem secrets novos no Vault — credenciais vivem em `nina_settings` (igual hoje).

## 9. Ordem de execução

1. Migration (adicionar colunas evolution_*).
2. Reescrever edge functions (sender, webhook, send-template, test-whatsapp, simulate-*, nina-orchestrator, message-grouper, health-check, validate-setup) e criar evolution-test/connect/configure-webhook.
3. Reescrever `ApiSettings.tsx` (UI Evolution + remoção UI Meta).
4. Atualizar `TemplatesManager.tsx` e `SystemHealthCard`/`SystemRoadmap`.
5. Deploy automático das functions.
6. Verificar que nenhum import/uso restante de `whatsapp_access_token` / `graph.facebook.com` permanece (`rg`).
