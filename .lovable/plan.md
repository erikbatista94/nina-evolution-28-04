

## Plano: Corrigir e Padronizar Sistema de Atribuição de Conversas

### Problema raiz identificado

O dropdown "Responsável" (linha 941 do ChatInterface.tsx) usa `member.id` (ID da tabela `team_members`) como valor das options, mas o campo `assigned_user_id` na tabela `conversations` armazena o UUID de `auth.users` (`member.user_id`). Isso causa:

1. Ao atribuir, grava o ID errado no banco
2. O filtro "Minhas" compara `assignedUserId` com `user?.id` (auth UUID) -- nunca bate
3. Badges de atribuição falham silenciosamente

### Mudanças necessárias

#### 1. Corrigir dropdown "Responsável" (`ChatInterface.tsx`)

Trocar `member.id` por `member.user_id` no `<option value>` e no `<select value>`. Filtrar membros sem `user_id` (contas ainda não vinculadas).

#### 2. Lógica de "Atendimento Humano" com auto-atribuição (`ChatInterface.tsx`)

Substituir `handleStatusChange('human')` por lógica contextual:
- Se `!assignedUserId` → atribuir ao user logado + mudar status
- Se `assignedUserId === user.id` → apenas mudar status
- Se `assignedUserId !== user.id` e `!isAdmin` → bloquear com toast de erro
- Se `isAdmin` → permitir sempre

#### 3. Badges de atribuição na lista de conversas (`ChatInterface.tsx`)

Mostrar badges para todos os usuários (não só admin):
- "Não atribuída" (amarelo) 
- "Minha" (cyan) quando `assignedUserId === user.id`
- Nome do responsável quando atribuída a outro

#### 4. Nenhuma mudança no backend

O `api.assignConversation` já faz corretamente: atualiza `assigned_user_id` na conversa e `owner_id` no deal. O realtime subscription de `conversations` já propaga UPDATE events. O hook `useConversations.assignConversation` já faz optimistic update do `assignedUserId`.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/ChatInterface.tsx` | Corrigir value do dropdown, auto-atribuição no "Humano", badges para todos |

### Sem migration necessária

O campo `assigned_user_id` e a sincronização com deals já existem e funcionam corretamente. O problema é exclusivamente no frontend.

