

## Plano: Reduzir latência do WhatsApp

Mudanças mínimas em 3 arquivos + 1 update no banco.

### 1. GROUPING_DELAY_MS: 10000 → 3500

**Arquivo:** `supabase/functions/whatsapp-webhook/index.ts`, linha 13

```
// DE:
const GROUPING_DELAY_MS = 10000; // 10 seconds
// PARA:
const GROUPING_DELAY_MS = 3500; // 3.5 seconds
```

Isso reduz o tempo que o webhook espera antes de agrupar mensagens consecutivas. Com 3.5s, o cliente ainda pode enviar 2-3 mensagens seguidas e elas serão agrupadas numa só resposta.

### 2. response_delay: ajustar para ~1s

Dois locais com valores default que servem de fallback:

- **`supabase/functions/nina-orchestrator/index.ts`**, linhas 203-204: `response_delay_min: 1000`, `response_delay_max: 3000` → alterar para `500` e `1500`
- **`supabase/functions/initialize-system/index.ts`**, linhas 187-188: mesmos valores → alterar para `500` e `1500`

Esses são fallbacks. O valor real vem da tabela `nina_settings`. Será necessário um **migration SQL** para atualizar os registros existentes:

```sql
UPDATE nina_settings SET response_delay_min = 500, response_delay_max = 1500;
```

### 3. Como testar

1. **Mensagem única**: enviar 1 mensagem → resposta deve chegar em ~4-5s (3.5s grouping + ~1s delay)
2. **3 mensagens seguidas** (dentro de 3.5s): enviar 3 mensagens rápidas → deve gerar apenas 1 resposta agrupada
3. **Confirmar 1 resposta**: verificar na tabela `messages` que só há 1 registro `from_type = 'nina'` para o grupo

### 4. Rollback

Reverter os 3 valores:
- `GROUPING_DELAY_MS = 10000` no webhook
- `response_delay_min = 1000`, `response_delay_max = 3000` no orchestrator e initialize-system
- `UPDATE nina_settings SET response_delay_min = 1000, response_delay_max = 3000;`

Ou usar o botão de revert no histórico do chat.

### Resumo de arquivos
| Arquivo | Mudança |
|---|---|
| `supabase/functions/whatsapp-webhook/index.ts` | GROUPING_DELAY_MS: 10000 → 3500 |
| `supabase/functions/nina-orchestrator/index.ts` | fallback delay: 1000/3000 → 500/1500 |
| `supabase/functions/initialize-system/index.ts` | default delay: 1000/3000 → 500/1500 |
| Migration SQL | UPDATE nina_settings existentes |

