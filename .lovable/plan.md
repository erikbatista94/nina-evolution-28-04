

## Plano: Agendamentos 100% + Mídia 100% Confiável

### Status: ✅ Implementado

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/ChatInterface.tsx` | Pending appointment CTA (confirmar/rejeitar), media-proxy URLs, slot → cria appointment pendente |
| `src/components/Scheduling.tsx` | Endereço + Maps no modal de detalhes, "Entrar na sala" só para meetings online |
| `supabase/functions/media-proxy/index.ts` | **Novo** — proxy de mídia com JWT + permissão por conversa |
| `supabase/functions/google-calendar-sync/index.ts` | **Novo** — auto-sync protegido por x-cron-secret |
| `supabase/config.toml` | Adicionado media-proxy e google-calendar-sync |
| Migration | Coluna `location` em `appointments` |
| pg_cron | Auto-sync a cada 5 min com vault secret |

### Checklist de teste
1. Chat: escolher horário → CTA pendente aparece → confirmar cria evento Nina + Google
2. Rejeitar → appointment removido
3. Cron: eventos do Google aparecem sem clicar "Sincronizar" (aguardar 5 min)
4. Título sempre no formato "Vendedor: Visita - Cliente - Endereço"
5. Modal de detalhes mostra endereço + botão Maps (não mostra "Entrar na sala" para visitas)
6. Clicar em anexo na Nina → abre sem ERR_BLOCKED_BY_CLIENT (via media-proxy)
