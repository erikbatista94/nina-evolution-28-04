

## Plano: Controle de Visualização por Usuário (Pipeline + Dashboard)

### Contexto

O campo `deals.owner_id` já armazena o `auth.user_id` (sincronizado via `assignConversation`). A filtragem será feita no frontend, mantendo o Realtime funcional para todos.

### Mudanças

#### 1. `src/components/Kanban.tsx` — Filtro por role + dropdown admin

- Importar `useAuth` e `useCompanySettings` para obter `user.id` e `isAdmin`
- Adicionar estado `selectedOwnerFilter` (string | 'all')
- **Vendedor**: filtrar `deals` onde `deal.ownerId === user.id` (antes de aplicar `searchQuery`)
- **Admin**: mostrar todos por padrão; adicionar dropdown "Responsável" no header (ao lado do search) com opções: "Todos", lista de `teamMembers` com `user_id`
- Quando admin selecionar vendedor, filtrar `deals` por `deal.ownerId === selectedUserId`

#### 2. `src/components/Dashboard.tsx` — Métricas filtradas por usuário

- Importar `useAuth` e `useCompanySettings`
- Adicionar estado `selectedSeller` (string | 'all')
- Modificar chamadas a `api.fetchDashboardMetrics` e `api.fetchChartData` para aceitar parâmetro opcional `userId`
- **Vendedor**: passar automaticamente `user.id`
- **Admin**: mostrar dropdown "Vendedor" no header; passar `selectedSeller` quando não for 'all'

#### 3. `src/services/api.ts` — Adicionar filtro userId às queries

- `fetchDashboardMetrics(days, userId?)`: quando `userId` fornecido, adicionar `.eq('assigned_user_id', userId)` nas queries de conversations, e `.eq('owner_id', userId)` nos deals/appointments
- `fetchChartData(days, userId?)`: mesma lógica de filtro
- `fetchPipeline(userId?)`: quando `userId` fornecido, adicionar `.eq('owner_id', userId)` na query de deals

#### 4. `src/types.ts` — Sem mudanças

O tipo `Deal` já tem `ownerId`. Nenhuma alteração de tipo necessária.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/services/api.ts` | Adicionar parâmetro `userId?` a `fetchDashboardMetrics`, `fetchChartData`, `fetchPipeline` |
| `src/components/Kanban.tsx` | Filtro por vendedor (auto para vendedor, dropdown para admin) |
| `src/components/Dashboard.tsx` | Filtro por vendedor (auto para vendedor, dropdown para admin) |

### Sem migration necessária

A filtragem é client-side. O RLS já permite acesso a todos os deals para usuários autenticados (single-tenant). A segregação visual é feita no frontend baseada no `owner_id`.

