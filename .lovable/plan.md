

## Plano: Dashboard inteligente por role — "Meu Dia" + Admin SLA

### Arquitetura

`Dashboard.tsx` bifurca por `isAdmin`:
- **Admin**: mantém dashboard atual + novo `DashboardSlaBlock`
- **Vendedor**: novo `DashboardMyDay` com 3 blocos

### Auditoria dos 3 pontos obrigatórios

1. **`conversations.last_message_at`**: Existe e é atualizado pelo trigger `update_conversation_last_message()` a cada mensagem. Confiável — usaremos direto.

2. **`appointments`**: Schema tem `date` (tipo `date`) e `user_id` (UUID do responsável). Filtro: `.eq('date', todayStr)` onde `todayStr = new Date().toISOString().split('T')[0]`, e `.eq('user_id', userId)`.

3. **Limite de alerts**: Adicionar `.limit(200)` na query do `useAlerts` para proteger performance.

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/components/DashboardMyDay.tsx` | **Novo**: 3 blocos operacionais para vendedor |
| `src/components/DashboardSlaBlock.tsx` | **Novo**: bloco SLA reutilizável |
| `src/components/Dashboard.tsx` | Bifurcar: `isAdmin ? admin dashboard + SlaBlock : DashboardMyDay` |
| `src/hooks/useAlerts.ts` | Adicionar `.limit(200)` na query |
| `src/components/ChatInterface.tsx` | Ler query param `suggested` e preencher input |

### DashboardMyDay.tsx

**Bloco 1 — Minhas conversas pendentes**
```ts
supabase.from('conversations')
  .select('*, contacts(name, call_name, phone_number)')
  .eq('assigned_user_id', userId)
  .eq('is_active', true)
  .order('last_message_at', { ascending: false })
  .limit(10)
```
Cada item: nome contato, tempo relativo desde `last_message_at`, ação "Abrir" → `/chat?conversation={id}`

**Bloco 2 — Agendamentos de hoje**
```ts
const todayStr = new Date().toISOString().split('T')[0];
supabase.from('appointments')
  .select('*, contacts(name, call_name)')
  .eq('date', todayStr)
  .eq('user_id', userId)
  .order('time', { ascending: true })
```

**Bloco 3 — Leads em risco (SLA)**
- Reutiliza `useAlerts()` (RLS filtra por vendedor)
- Agrupa por nível, mostra contagem + top 5
- "Inserir follow-up" navega para `/chat?conversation={id}&suggested={encodeURIComponent(msg)}`

### DashboardSlaBlock.tsx

- Recebe alerts do `useAlerts()`
- 3 mini-cards com contagem por nível
- Lista top 10 com nome do contato, nível, tempo, responsável
- Ação: "Abrir conversa"

### Dashboard.tsx

```tsx
if (!isAdmin) return <DashboardMyDay />;
// ... existing admin dashboard ...
// + <DashboardSlaBlock /> ao final
```

### useAlerts.ts — `.limit(200)`

Adicionar limit na query para evitar sobrecarga.

### ChatInterface.tsx — preencher input com `suggested`

Na inicialização, ler `searchParams.get('suggested')` e setar no `newMessage` state. Limpar o param da URL após preencher.

### Checklist de teste
1. Login vendedor → /dashboard mostra "Meu Dia" com dados filtrados
2. Login admin → /dashboard mostra dashboard geral + bloco SLA
3. "Abrir conversa" navega corretamente
4. "Inserir follow-up" preenche input do chat sem enviar
5. Performance OK com muitos alerts (limit 200)

