

## Plano: Filtro "Geral / Atribuídas a mim" no Chat Ao Vivo

### Auditoria do Schema (resultado)

| Campo | Tabela | Status |
|---|---|---|
| `assigned_user_id` | `conversations` | Já existe (uuid, nullable) |
| `assigned_team` | `conversations` | Já existe (enum) |
| `owner_id` | `deals` | Já existe |
| Round-robin trigger | `conversations` INSERT | Já preenche `assigned_user_id` |
| `isAdmin` | `useCompanySettings` hook | Já consulta `user_roles.role === 'admin'` |
| `auth.uid()` | Disponível via `useAuth` | Já exposto |

Nenhuma migration necessária. O campo `assigned_user_id` e o round-robin já estão operacionais.

### Implementação

#### 1. RLS — Manter como está (sem alteração)

A RLS atual permite `authenticated` acessar todas as conversas. O filtro será feito no frontend/query level. Razão: alterar RLS para restringir por `assigned_user_id` quebraria o realtime (que precisa ver todas as mensagens para o canal funcionar) e impediria vendedores de ver conversas ainda não atribuídas. O controle de visibilidade será por filtro na UI.

#### 2. `src/hooks/useConversations.ts` — Nenhuma alteração

O hook já carrega todas as conversas. O filtro será aplicado no componente (client-side), pois o volume é limitado (50 conversas max) e isso evita quebrar o realtime.

#### 3. `src/components/ChatInterface.tsx` — Alterações principais

**Novos estados:**
```typescript
const [viewFilter, setViewFilter] = useState<'all' | 'mine'>(() => {
  return (localStorage.getItem('chat-view-filter') as 'all' | 'mine') || 'all';
});
const [assignedFilter, setAssignedFilter] = useState<string>('all');
```

**Importações adicionais:**
- `useAuth` para obter `user.id`
- `Select` components do UI

**Lógica de filtragem (substituir `filteredConversations`):**
```typescript
const filteredConversations = conversations.filter(chat => {
  // Filtro de busca textual (existente)
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    if (!(chat.contactName.toLowerCase().includes(query) ||
          chat.contactPhone.includes(query) ||
          chat.lastMessage.toLowerCase().includes(query))) {
      return false;
    }
  }
  // Filtro "Atribuídas a mim"
  if (viewFilter === 'mine') {
    return chat.assignedUserId === user?.id;
  }
  // Filtro por vendedor (gestor)
  if (assignedFilter !== 'all') {
    if (assignedFilter === 'unassigned') return !chat.assignedUserId;
    return chat.assignedUserId === assignedFilter;
  }
  return true;
});
```

**UI do filtro (entre header e search bar):**
- Dois botões toggle: "Geral" | "Atribuídas a mim (N)"
- Se `isAdmin`: dropdown `Select` com "Todos" / "Não atribuídas" / lista de `teamMembers` ativos
- Persistência do `viewFilter` em `localStorage`

**Badge "Não atribuída" na lista de conversas:**
- Quando `chat.assignedUserId === null` e `isAdmin`, mostrar badge amarelo "Não atribuída"

**Contador dinâmico:**
- "Atribuídas a mim" mostra `(N)` com count de conversas onde `assignedUserId === user?.id`

#### 4. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/ChatInterface.tsx` | Filtro toggle + dropdown gestor + badge + contador |

Nenhuma migration. Nenhuma alteração em services/api. Nenhuma alteração em RLS.

### Teste no Preview

1. Logar como admin → ver "Geral" selecionado → todas as conversas visíveis
2. Clicar "Atribuídas a mim" → só conversas com `assigned_user_id` = seu ID
3. Usar dropdown "Responsável" → filtrar por vendedor específico ou "Não atribuídas"
4. Recarregar página → filtro persiste (localStorage)
5. Realtime continua funcionando em qualquer filtro

### Rollback

Reverter apenas `ChatInterface.tsx` via histórico.

