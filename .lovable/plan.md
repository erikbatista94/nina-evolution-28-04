

## Plano: 5 Melhorias — Menu Contexto + 4 Melhorias Úteis

### 1. Menu de contexto (botão direito) nas conversas ✅ Aprovado
Ao clicar com botão direito em uma conversa na lista lateral:
- **Marcar como não lida** — seta `unreadCount` localmente e atualiza `messages.status` no banco
- **Temperatura** → Quente / Morno / Frio → atualiza `lead_temperature` em `contacts`
- **Tipo de cliente** → Arquiteto / Construtora / Cliente Final / Lojista / Engenheiro / Outro → atualiza `customer_type` em `contacts`

### 2. Badges de tipo de cliente e temperatura na lista ✅ Aprovado
Exibir badges visuais (🔥/🟡/❄️ + "Arquiteto", "Construtora" etc.) no card da conversa na lista lateral. Campos já existem no banco (`customer_type`, `lead_temperature`), só falta popular no `UIConversation` e renderizar.

### 3. Notificação sonora em nova mensagem recebida
Tocar um som curto (beep) quando chega uma mensagem inbound em qualquer conversa. Usar `new Audio()` com um data URI base64 de um beep curto (sem arquivo externo). Opção de silenciar via botão no header da lista.

### 4. Contador de conversas por status no header
Adicionar no topo da lista lateral contadores clicáveis: "🤖 Nina: 12 | 👤 Humano: 5 | ⏸ Pausado: 3". Clicar filtra a lista por aquele status. Já temos os dados, é só `conversations.filter(c => c.status === x).length`.

### 5. Preview da última mídia na lista de conversas
Quando a última mensagem é imagem, mostrar um thumbnail pequeno (20x20) ao lado do texto "📷 Imagem" na lista lateral. Para áudio, mostrar duração se disponível. Usa o `mediaUrl` que já vem no `UIMessage`.

---

### Arquivos afetados
- `src/types.ts` — adicionar `contactCustomerType` e `contactTemperature` ao `UIConversation`
- `src/components/ChatInterface.tsx` — menu contexto, badges, filtro por status, som, thumbnail
- `src/hooks/useConversations.ts` — popular novos campos e sincronizar via Realtime

Sem migrations, sem edge functions, sem refatoração.

