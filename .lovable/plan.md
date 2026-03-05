

## Plano: Correção end-to-end de mídia no chat

### Diagnóstico

Identifiquei **3 problemas** que impedem o funcionamento:

**Problema 1 — `ownerSettings` é null no message-grouper.**
Na linha 82-86, a query busca `nina_settings` filtrando por `whatsapp_phone_number_id`. Mas os logs do webhook mostram `"No owner in settings"`, o que significa que não há registro com esse `phone_number_id` na tabela. O message-grouper não tem fallback (diferente do webhook que busca admin). Resultado: `settings?.whatsapp_access_token` é null → **download de mídia é silenciosamente ignorado** → `media_url` nunca é salva.

**Problema 2 — Código duplicado (orphan block) no message-grouper.**
Linhas 423-462 contêm um bloco de código órfão (corpo de `downloadWhatsAppMedia` duplicado, sem declaração de função). Isso pode causar erro de deploy ou comportamento inesperado.

**Problema 3 — Frontend OK, mas sem dados.**
O `ChatInterface.tsx` já renderiza IMAGE/VIDEO/DOCUMENT corretamente. O `types.ts` já mapeia os tipos. O problema é que `media_url` nunca chega preenchido porque o backend não baixa a mídia.

### Correções

#### 1. `supabase/functions/message-grouper/index.ts`

- **Remover bloco órfão** (linhas 423-462) — código duplicado sem função
- **Adicionar fallback na busca de settings** (linhas 82-86): replicar a lógica do webhook — buscar por `phone_number_id`, se não encontrar buscar qualquer registro com `whatsapp_access_token` não nulo (padrão single-tenant)
- **Adicionar logs** para quando settings não é encontrado ou media download falha

Mudança concreta:
```typescript
// Antes (linha 82-86):
const { data: ownerSettings } = await supabase
  .from('nina_settings')
  .select('user_id, whatsapp_access_token')
  .eq('whatsapp_phone_number_id', phoneNumberId)
  .maybeSingle();

// Depois:
let { data: ownerSettings } = await supabase
  .from('nina_settings')
  .select('user_id, whatsapp_access_token')
  .eq('whatsapp_phone_number_id', phoneNumberId)
  .maybeSingle();

// Fallback: buscar qualquer settings com token
if (!ownerSettings?.whatsapp_access_token) {
  const { data: fallbackSettings } = await supabase
    .from('nina_settings')
    .select('user_id, whatsapp_access_token')
    .not('whatsapp_access_token', 'is', null)
    .limit(1)
    .maybeSingle();
  if (fallbackSettings) ownerSettings = fallbackSettings;
}
```

#### 2. Nenhuma mudança no frontend

O `ChatInterface.tsx` já tem rendering correto para IMAGE (thumbnail clicável), VIDEO (`<video controls>`), e DOCUMENT (card com link). Os tipos já estão mapeados. O único problema era o backend não populando `media_url`.

#### 3. Nenhuma mudança no schema

A tabela `messages` já tem `media_url` e `media_type`. O bucket `whatsapp-media` já existe (público). Storage policies já estão criadas.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/message-grouper/index.ts` | Remover bloco órfão (linhas 423-462), adicionar fallback para busca de settings |

### Teste

1. Enviar **imagem** pelo WhatsApp → deve aparecer thumbnail clicável no chat
2. Enviar **vídeo** → deve aparecer player com controls
3. Enviar **PDF** → deve aparecer card com link para download
4. Aguardar 10 min e reabrir → mídia deve continuar acessível (URL do Storage, não do WhatsApp)

### Rollback

Reverter o único arquivo `message-grouper/index.ts` via histórico.

