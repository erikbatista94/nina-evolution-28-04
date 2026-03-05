

## Plano: Salvar e exibir sender_user_id em mensagens humanas

### Problema

Quando um agente humano envia mensagem, não há como saber **qual** agente enviou. Todas aparecem iguais. O campo `sender_user_id` não existe em `messages`.

### Mudanças

#### 1. Migration: adicionar `sender_user_id` a `messages`

```sql
ALTER TABLE public.messages ADD COLUMN sender_user_id uuid NULL;
CREATE INDEX idx_messages_sender_user_id ON public.messages (sender_user_id);
```

Sem FK para `auth.users` (padrão do projeto). Nullable porque mensagens de Nina/user não têm sender.

#### 2. `src/services/api.ts` — gravar `sender_user_id` no insert

Na função `sendMessage` (linha 1310), adicionar `sender_user_id` ao insert de `messages`:

```typescript
// Obter user_id antes do insert
const { data: { user: currentUser } } = await supabase.auth.getUser();

.insert({
  conversation_id: conversationId,
  content: content,
  type: 'text',
  from_type: 'human',
  status: 'processing',
  sent_at: new Date().toISOString(),
  sender_user_id: currentUser?.id || null  // NOVO
})
```

#### 3. `src/types.ts` — adicionar `senderUserId` e `senderName` ao UIMessage

```typescript
export interface UIMessage {
  // ...existente
  senderUserId: string | null;
  senderName: string | null;
}
```

Em `transformDBToUIMessage`, mapear `msg.sender_user_id` para `senderUserId`. `senderName` será null (populado pelo componente via cache de team_members).

#### 4. `src/components/ChatInterface.tsx` — exibir nome do agente

Na renderização de mensagens (linha 664), quando `msg.fromType === 'human'` e `isOutgoing`:

- Fazer lookup de `msg.senderUserId` no array `teamMembers` (já carregado no state, linha 28)
- Exibir nome do agente acima da bolha ou ao lado do ícone User

```tsx
{isOutgoing && msg.fromType === 'human' && (
  <span className="text-[10px] text-cyan-400 font-medium">
    {teamMembers.find(m => m.userId === msg.senderUserId)?.name || 'Agente'}
  </span>
)}
```

#### 5. `src/hooks/useConversations.ts` — optimistic update com senderUserId

Na criação da `tempMessage` (linha ~235), adicionar `senderUserId: user?.id` e `senderName: null`.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Migration SQL | `ADD COLUMN sender_user_id`, index |
| `src/services/api.ts` | Gravar `sender_user_id` no insert |
| `src/types.ts` | `senderUserId`/`senderName` em UIMessage + transform |
| `src/components/ChatInterface.tsx` | Exibir nome do agente na bolha |
| `src/hooks/useConversations.ts` | `senderUserId` na temp message |

### Teste

1. Logar como Agente A → enviar mensagem → nome "Agente A" aparece na bolha
2. Logar como Agente B → enviar mensagem → nome "Agente B" aparece
3. Mensagens de Nina continuam com ícone Bot, sem nome de agente
4. Mensagens do cliente (incoming) não são afetadas

