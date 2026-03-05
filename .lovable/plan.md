

## Plano: Controle de Acesso Admin + WhatsApp do Atendente + Enviar Lead

Este é um conjunto grande de mudanças. Vou dividir em 6 blocos independentes.

---

### Bloco 1: Migration — `whatsapp_number` e `force_password_change`

```sql
ALTER TABLE public.team_members ADD COLUMN whatsapp_number text NULL;
ALTER TABLE public.profiles ADD COLUMN force_password_change boolean NOT NULL DEFAULT false;
```

Sem FK. `whatsapp_number` em `team_members` (fonte da equipe). `force_password_change` em `profiles` (lido no login).

---

### Bloco 2: Remover Sign-Up da UI

**`src/pages/Auth.tsx`**: Remover toggle "Criar conta" / "Não tem uma conta?", formulário de nome, estado `isLogin` (fixar em `true`). Título fixo "Bem-vindo de volta". Remover `signUp` do fluxo.

---

### Bloco 3: Edge Function `admin-create-user`

Nova edge function que:
1. Valida `Authorization` header → `supabase.auth.getUser(token)` → checa `has_role(uid, 'admin')` via RPC
2. Recebe `{ name, email, role, team_id, function_id, weight, whatsapp_number, status }`
3. Gera senha temporária (12 chars aleatórios)
4. Cria usuário via `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } })`
5. O trigger `handle_new_user` já cria `profiles` e `user_roles` automaticamente
6. Atualiza `profiles.force_password_change = true` para o novo user
7. Atualiza `user_roles.role` para o role correto (se diferente do default)
8. Cria/atualiza `team_members` com `user_id`, `name`, `email`, `role`, `team_id`, `function_id`, `weight`, `whatsapp_number`, `status`
9. Retorna `{ success, user_id, temporary_password }`

**`supabase/config.toml`**: Adicionar `[functions.admin-create-user]` com `verify_jwt = false`.

---

### Bloco 4: UI de Criar Usuário em `/team` + Senha Temporária

**`src/components/Team.tsx`**:
- Substituir o modal "Convidar" pelo fluxo "Criar Usuário" que chama a edge function `admin-create-user`
- Adicionar campo `whatsapp_number` ao formulário (create e edit)
- Após sucesso, exibir modal com credenciais (email + senha temporária) e botão "Copiar credenciais"
- Adicionar campo `whatsapp_number` ao edit modal também

**`src/types.ts`**: Adicionar `whatsapp_number?: string | null` e `user_id?: string | null` ao `TeamMember`

---

### Bloco 5: Force Password Change + Allowlist

**`src/hooks/useAuth.tsx`** ou **`src/components/ProtectedRoute.tsx`**:
- Após login, buscar `profiles.force_password_change` do user
- Se `true`, exibir modal de troca de senha (bloqueia navegação)
- Ao trocar, chamar `supabase.auth.updateUser({ password })` e depois update `profiles.force_password_change = false`

**Allowlist** (em `ProtectedRoute.tsx`):
- Após confirmar `user` logado, buscar `team_members` com `user_id = auth.uid()`
- Se não existir ou `status = 'disabled'`, fazer `signOut()` e redirecionar com mensagem "Acesso não autorizado"

---

### Bloco 6: Sidebar + Route Guard para /settings (admin only)

**`src/components/Sidebar.tsx`**:
- Filtrar `menuItems`: só mostrar "Configurações" se `isAdmin`

**`src/App.tsx`**:
- Criar `AdminRoute` wrapper que checa `isAdmin` e redireciona para `/dashboard` se não for admin
- Envolver `/settings` com `AdminRoute`

---

### Bloco 7: Botões "Enviar lead para WhatsApp"

**`src/components/ChatInterface.tsx`** — no painel "Informações do Lead":
- Buscar `whatsapp_number` do user logado via `teamMembers.find(m => m.user_id === user?.id)?.whatsapp_number`
- Buscar `whatsapp_number` do responsável via `teamMembers.find(m => m.user_id === activeChat.assignedUserId)?.whatsapp_number`

Dois botões:
1. "Enviar para meu WhatsApp" (usa whatsapp do logado)
2. "Enviar para WhatsApp do responsável" (usa whatsapp do assigned)

Ao clicar, montar URL:
```
https://wa.me/{whatsapp_number}?text={encodeURIComponent(mensagem)}
```

Mensagem:
```
*Lead GG*
Nome: {contact.name}
Telefone: {contact.phone_number}
Interesses: {interests.join(', ')}
Última msg: {última mensagem from_type=user}
Próxima ação: {next_best_action}
Link: {window.location.origin}/chat?conversation={conversationId}
```

Abrir em nova aba via `window.open(url, '_blank')`.

---

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Migration SQL | `whatsapp_number` em team_members, `force_password_change` em profiles |
| `supabase/functions/admin-create-user/index.ts` | Nova edge function |
| `supabase/config.toml` | Registro da nova function |
| `src/pages/Auth.tsx` | Remover sign-up, só login |
| `src/components/Team.tsx` | Criar usuário via edge function, campo whatsapp, modal credenciais |
| `src/types.ts` | `whatsapp_number`, `user_id` em TeamMember |
| `src/components/ProtectedRoute.tsx` | Allowlist check + force password change modal |
| `src/components/Sidebar.tsx` | Esconder "Configurações" para não-admin |
| `src/App.tsx` | AdminRoute guard para /settings |
| `src/components/ChatInterface.tsx` | Botões "Enviar lead para WhatsApp" |

### Riscos e mitigações

- O trigger `handle_new_user` atribui role `user` por default. A edge function corrige logo em seguida para o role correto.
- A allowlist pode bloquear o admin se ele não tiver `team_members` entry. Mitigação: skip allowlist se `has_role(admin)`.
- `profiles` RLS permite apenas own-row update. A edge function usa service role, então funciona.

