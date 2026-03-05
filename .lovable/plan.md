

## Plano: Prefixar nome do atendente nas mensagens humanas enviadas ao WhatsApp

### Situação atual

- `api.sendMessage` já grava `sender_user_id: currentUser?.id` no insert de `messages` e enfileira na `send_queue` com `from_type: 'human'`
- `whatsapp-sender` usa `queueItem.content` diretamente como body do texto enviado ao Graph API
- O sender não consulta `messages` nem `team_members` — envia o conteúdo cru da fila

### Mudança: apenas `supabase/functions/whatsapp-sender/index.ts`

Na função `sendMessage()`, antes de montar o payload, adicionar lógica de prefixo:

1. **Se `queueItem.from_type === 'human'` e `queueItem.message_id` existe:**
   - Buscar `sender_user_id` da tabela `messages` pelo `message_id`
   - Se `sender_user_id` não for null, resolver nome:
     - Primeiro: `team_members.name WHERE user_id = sender_user_id`
     - Fallback: `profiles.full_name WHERE user_id = sender_user_id`
   - Se encontrou nome e o conteúdo ainda não começa com `"NomeAgente:"`, prefixar: `"${agentName}: ${content}"`

2. **Persistência para auditoria:**
   - Ao fazer update da mensagem (linha 295-302), adicionar `metadata: { outgoing_text: textoComPrefixo }` para registro do que foi enviado ao WhatsApp

3. **Proteção contra duplicação:**
   - Checar `content.startsWith(agentName + ':')` antes de prefixar

### Código (trecho central)

```typescript
// Inside sendMessage(), before building payload:
let finalContent = queueItem.content;

if (queueItem.from_type === 'human' && queueItem.message_id) {
  // Fetch sender_user_id from the message record
  const { data: msgRecord } = await supabase
    .from('messages')
    .select('sender_user_id')
    .eq('id', queueItem.message_id)
    .maybeSingle();

  if (msgRecord?.sender_user_id) {
    // Resolve agent name
    let agentName: string | null = null;
    
    const { data: member } = await supabase
      .from('team_members')
      .select('name')
      .eq('user_id', msgRecord.sender_user_id)
      .eq('status', 'active')
      .maybeSingle();
    
    agentName = member?.name || null;

    if (!agentName) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', msgRecord.sender_user_id)
        .maybeSingle();
      agentName = profile?.full_name || null;
    }

    if (agentName && !finalContent.startsWith(`${agentName}:`)) {
      finalContent = `${agentName}: ${finalContent}`;
    }
  }
}
```

Depois, usar `finalContent` em vez de `queueItem.content` no payload e salvar `outgoing_text` no metadata.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/whatsapp-sender/index.ts` | Prefixar nome do agente + salvar outgoing_text no metadata |

Nenhuma migration. `messages.content` permanece texto puro. O texto enviado ao WhatsApp (com prefixo) fica em `messages.metadata.outgoing_text`.

### Teste

1. Gabriel envia "Oi" → WhatsApp recebe "Gabriel Souza: Oi"
2. Erik envia "Tudo bem?" → WhatsApp recebe "Erik Batista: Tudo bem?"
3. Nina envia mensagem → sem prefixo
4. `sender_user_id` null → sem prefixo
5. Agente digita "Gabriel Souza: teste" → não duplica

