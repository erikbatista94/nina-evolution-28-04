

## Parte 1 — 3 Melhorias Novas Sugeridas (não implementar agora)

### 1. Resumo Automático da Conversa no Card do Pipeline
**Por que é boa:** Hoje o vendedor precisa abrir o drawer do deal e ler mensagens para entender o contexto. Um resumo de 1-2 linhas gerado a partir do `client_memory.interaction_summary` e `sales_intelligence.next_best_action` direto no card do Kanban daria contexto imediato sem clique.
**O que muda:** No componente Kanban, cada card exibiria uma linha como "Cliente interessado em porcelanato, aguardando orçamento" extraída dos dados que já existem no `client_memory`.
**Esforço:** Baixo (frontend only, dados já existem)
**Risco:** Baixo

### 2. Painel de Follow-ups Pendentes no Dashboard
**Por que é boa:** Vendedores esquecem de retornar para leads. Um bloco no Dashboard mostrando "5 leads sem resposta há +24h" com link direto para a conversa reduziria perda de leads.
**O que muda:** Novo bloco no Dashboard que consulta conversas onde `last_message_at` tem mais de X horas e a última mensagem é do tipo `user` (cliente esperando resposta). Clicável para abrir a conversa.
**Esforço:** Baixo (query simples + componente pequeno)
**Risco:** Baixo

### 3. Exportação Rápida de Contatos (CSV)
**Por que é boa:** Operação comercial frequentemente precisa exportar a base de leads para planilhas, campanhas ou relatórios externos. Hoje não há como fazer isso.
**O que muda:** Botão "Exportar CSV" na tela de Contatos que gera download com nome, telefone, email, temperatura, tipo, tags, data do último contato.
**Esforço:** Baixo (frontend only, dados já carregados)
**Risco:** Baixo

---

## Parte 2 — Implementar Sistema de Notificações (Som + Push Nativo)

### O que será feito

1. **Criar utilitário `src/utils/notifications.ts`** — módulo central com:
   - `requestNotificationPermission()` — pede permissão ao navegador
   - `getNotificationStatus()` — retorna 'granted' | 'denied' | 'default'
   - `showBrowserNotification(title, body, conversationId)` — exibe notificação nativa; ao clicar, foca a janela e navega para `/chat` com query param `?conv=ID`
   - `playNotificationSound()` — toca beep via AudioContext
   - Deduplicação interna via `Set<string>` de message IDs já notificados

2. **Modificar `src/hooks/useConversations.ts`** — no handler de Realtime INSERT de mensagens:
   - Quando `newMessage.from_type === 'user'` E o ID não está no set de dedup:
     - Chamar `showBrowserNotification()` com nome do contato e trecho da mensagem
     - Chamar `playNotificationSound()` se som habilitado
   - Usar `document.visibilityState` e `selectedChatId` para suprimir notificação quando o usuário está vendo a conversa ativa
   - Respeitar escopo do vendedor (já filtrado pelo Realtime/RLS existente)

3. **Modificar `src/components/ChatInterface.tsx`** — no header da lista lateral:
   - Manter toggle de som existente (Volume2/VolumeX)
   - Adicionar toggle de notificação do navegador (Bell/BellOff)
   - Mostrar badge de status: "Permitido" / "Bloqueado" / "Desativado"
   - Botão para pedir permissão se status === 'default'
   - Salvar preferências em localStorage (`chat-notifications-enabled`)

4. **Navegação ao clicar na notificação** — `notification.onclick` faz:
   - `window.focus()`
   - `window.location.hash` ou `navigate('/chat?conv=ID')` 
   - O ChatInterface já lê query params ou pode ser ajustado para auto-selecionar a conversa

5. **Suprimir spam** — lógica de visibilidade:
   - Se `document.visibilityState === 'visible'` E a conversa ativa === conversa da mensagem → não mostrar push (só som se habilitado)
   - Se `document.hidden` ou conversa diferente → mostrar push + som

### Arquivos alterados
- **Novo:** `src/utils/notifications.ts`
- **Editado:** `src/hooks/useConversations.ts` (integrar notificações no handler Realtime)
- **Editado:** `src/components/ChatInterface.tsx` (controles de notificação no header + auto-select por query param)

### Deduplicação
- `Set<string>` de message IDs já notificados no módulo `notifications.ts`
- Combinado com o `processedMessageIds` já existente no useConversations

### Como testar
1. Abrir o Preview → Chat → clicar no ícone de sino para pedir permissão
2. Permitir notificações no navegador
3. Simular mensagem via webhook ou Realtime
4. Verificar: som toca + notificação aparece no sistema
5. Clicar na notificação → foca a aba e abre a conversa correta
6. Testar com a conversa ativa aberta → não deve mostrar push redundante

