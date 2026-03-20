

## Plano: Envio robusto de mídia para TODOS os tipos + 3 ajustes obrigatórios

### Auditoria atual

| Tipo | Modo atual | Problema |
|---|---|---|
| `audio` | `uploadMediaToWhatsApp` → `audio: { id }` | OK (robusto) |
| `image` | `image: { link: media_url }` | Falha com bucket privado |
| `document` | `document: { link: media_url, filename: content }` | Falha + filename errado |
| `video` | Não tratado (cai no default text) | Falha |

### 3 ajustes incorporados

1. **`storage_path` em vez de `media_url`**: O `uploadMediaToWhatsApp` passa a usar `metadata.storage_path` (caminho direto no bucket) como fonte primária, com fallback para parsear `media_url`. O `sendFileMessage` e `sendAudioMessage` salvam `storage_path` no metadata da `send_queue`.

2. **`filename` do document via metadata**: `sendFileMessage` salva `metadata.filename = file.name`. O sender usa `metadata.filename || 'document.pdf'` em vez de `queueItem.content`.

3. **`caption` do video**: Só seta `caption` se `finalContent?.trim()` tiver conteúdo, senão `undefined`.

### Mudanças por arquivo

#### 1. `supabase/functions/whatsapp-sender/index.ts`

**Helper `uploadMediaToWhatsApp`** — aceitar `storagePath` direto:
- Novo parâmetro opcional `storagePath?: string`
- Se `storagePath` fornecido, usar direto; senão fallback para parsear `mediaUrl`
- Filename genérico baseado no mimeType (não hardcodar `audio.ogg`)

**Case `image`** — modo robusto:
```ts
case 'image': {
  const meta = (queueItem.metadata as any) || {};
  const mimeType = meta.mime_type || 'image/jpeg';
  const sp = meta.storage_path;
  const mediaId = await uploadMediaToWhatsApp(settings, supabase, queueItem.media_url, mimeType, sp);
  payload.type = 'image';
  payload.image = { id: mediaId, caption: finalContent?.trim() || undefined };
  if (queueItem.message_id) { /* save whatsapp_media_id */ }
  break;
}
```

**Case `document`** — modo robusto + filename de metadata:
```ts
case 'document': {
  const meta = (queueItem.metadata as any) || {};
  const mimeType = meta.mime_type || 'application/pdf';
  const sp = meta.storage_path;
  const mediaId = await uploadMediaToWhatsApp(settings, supabase, queueItem.media_url, mimeType, sp);
  payload.type = 'document';
  payload.document = { id: mediaId, filename: meta.filename || 'document.pdf' };
  if (queueItem.message_id) { /* save whatsapp_media_id */ }
  break;
}
```

**Novo case `video`** — modo robusto + caption condicional:
```ts
case 'video': {
  const meta = (queueItem.metadata as any) || {};
  const mimeType = meta.mime_type || 'video/mp4';
  const sp = meta.storage_path;
  const mediaId = await uploadMediaToWhatsApp(settings, supabase, queueItem.media_url, mimeType, sp);
  payload.type = 'video';
  payload.video = { id: mediaId, caption: finalContent?.trim() || undefined };
  if (queueItem.message_id) { /* save whatsapp_media_id */ }
  break;
}
```

**Case `audio`** — atualizar para usar `storage_path`:
```ts
const meta = (queueItem.metadata as any) || {};
const sp = meta.storage_path;
const mediaId = await uploadMediaToWhatsApp(settings, supabase, queueItem.media_url, meta.audio_mime_type || 'audio/ogg', sp);
```

#### 2. `src/services/api.ts`

**`sendFileMessage`** — adicionar `storage_path`, `filename`, `mime_type` no metadata + inserir na `send_queue`:
- Atualmente NÃO insere na `send_queue` (bug! arquivo não é enviado ao WhatsApp)
- Adicionar insert na `send_queue` + trigger `whatsapp-sender` (igual `sendAudioMessage`)
- Metadata: `{ storage_path: filePath, filename: file.name, mime_type: file.type }`

**`sendAudioMessage`** — adicionar `storage_path` no metadata:
- Metadata: `{ audio_mime_type: audioBlob.type, storage_path: filePath }`

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/whatsapp-sender/index.ts` | Cases image/document/video usam upload robusto por ID via `storage_path`. Helper genérico. Filename de metadata. Caption condicional. |
| `src/services/api.ts` | `sendFileMessage` insere na `send_queue` com metadata (storage_path, filename, mime_type). `sendAudioMessage` adiciona storage_path. |

### Bug crítico descoberto

O `sendFileMessage` atual **não insere na `send_queue`** e **não triggera o `whatsapp-sender`**. Isso explica por que arquivos nunca chegam ao WhatsApp. A correção adiciona essa inserção seguindo o mesmo padrão do `sendAudioMessage`.

### Checklist de teste
1. Enviar PDF no chat → chega no WhatsApp como documento com nome correto
2. Enviar imagem JPG/PNG → chega no WhatsApp
3. Enviar áudio gravado → chega (regressão)
4. Status muda de processing → sent
5. Em caso de erro, log mostra response body do WhatsApp

