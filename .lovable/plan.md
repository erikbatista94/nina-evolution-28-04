

## 3 Melhorias — 5 créditos no total

### 1. Busca Global com Atalho de Teclado (Ctrl+K)
**Por que é boa:** Hoje o vendedor precisa navegar manualmente entre páginas para encontrar um contato, conversa ou deal. Uma busca global tipo "spotlight" com `Ctrl+K` permite encontrar qualquer coisa em segundos — contato por nome/telefone, conversa, deal no pipeline — e navegar direto.
**O que muda:** Componente modal de busca (overlay) ativado por `Ctrl+K` ou ícone na Sidebar. Busca nos dados já carregados (contatos, conversas) via Supabase query leve. Cada resultado clicável leva à página correta (`/chat?conv=`, `/contacts`, `/pipeline`).
**Esforço:** Médio (novo componente + query + atalho global)
**Risco:** Baixo

### 2. Indicador de "Digitando agora" / Atividade Recente na Lista de Chats
**Por que é boa:** Vendedores não sabem quais leads estão online/ativos neste momento. Mostrar um badge pulsante "mensagem recente" (ex: bolinha verde) nos contatos que enviaram mensagem nos últimos 5 minutos destaca quem precisa de atenção imediata.
**O que muda:** Na lista lateral do chat, contatos com `lastMessageAt` < 5min recebem um indicador verde pulsante. Sem backend novo — usa timestamp que já existe no `UIConversation`.
**Esforço:** Baixo (CSS + lógica de timestamp)
**Risco:** Baixo

### 3. Atalho de Ações Rápidas no Card do Pipeline (Whatsapp + Agendar)
**Por que é boa:** Hoje o vendedor precisa abrir o drawer do deal para enviar mensagem ou agendar visita. Dois botões de ação rápida direto no card (ícone WhatsApp → abre chat, ícone Calendário → abre agendamento) eliminam cliques desnecessários.
**O que muda:** No Kanban, cada card ganha 2 ícones pequenos no hover: 💬 (navega para `/chat?conv=ID`) e 📅 (navega para `/scheduling`). Usa dados que já existem no deal (`conversation_id`, `contact_id`).
**Esforço:** Baixo (frontend only, 2 botões + navegação)
**Risco:** Baixo

---

### Arquivos afetados
- **Melhoria 1:** Novo `src/components/GlobalSearch.tsx` + edição em `src/App.tsx` (ou `Sidebar.tsx`) para montar o componente e registrar `Ctrl+K`
- **Melhoria 2:** `src/components/ChatInterface.tsx` — badge pulsante na lista lateral
- **Melhoria 3:** `src/components/Kanban.tsx` — botões de ação rápida no card

Todas frontend-only, sem migrations, sem edge functions.

