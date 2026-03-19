

## Plano: Envio de Áudio Robusto (upload → media_id) + Integração no Chat

### Problema com `audio.link`

O `whatsapp-sender` usa `audio: { link: media_url }` para áudio. Isso depende de URL 100% pública e falha com signed URLs ou buckets privados. O WhatsApp Cloud API rejeita URLs que não são diretamente acessíveis.

### Solução: modo robusto no `whatsapp-sender`

Alterar o case `audio` (e opcionalmente `image`/`document`) no `whatsapp-sender` para:

1. **Baixar o arquivo do Storage** usando service role (já disponível)
2. **Upload no WhatsApp Cloud API**: `POST /{phone_number_id}/media` com `multipart/form-data`
3. **Enviar mensagem** com `audio: { id: media_id }` em vez de `audio: { link: ... }`
4. **Salvar `whatsapp_media_id`** no metadata da mensagem

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/whatsapp-sender/index.ts` | Case `audio`: download do Storage → upload WhatsApp media → envio com `audio.id`. Nova helper `uploadMediaToWhatsApp()` |
| `src/services/api.ts` | Novo método `sendAudioMessage(conversationId, blob)`: upload blob → Storage, insert `messages` + `send_queue`, trigger sender |
| `src/components/AudioRecorder.tsx` | Remover `simulate-audio-webhook`, chamar `onSend(blob)` |
| `src/components/ChatInterface.tsx` | Conectar `AudioRecorder.onSend` → `api.sendAudioMessage` |
| `src/hooks/useConversations.ts` | Expor `sendAudioMessage` com optimistic update |

### Detalhes técnicos

#### 1. `whatsapp-sender` — helper `uploadMediaToWhatsApp`

```ts
async function uploadMediaToWhatsApp(
  settings: any, supabase: any, mediaUrl: string, mimeType: string
): Promise<string> {
  // 1. Parse storage path from mediaUrl
  const storagePath = mediaUrl.split('/whatsapp-media/')[1];
  
  // 2. Download from Storage (service role bypasses RLS)
  const { data, error } = await supabase.storage
    .from('whatsapp-media').download(storagePath);
  
  // 3. Upload to WhatsApp: POST /{phone_number_id}/media
  const form = new FormData();
  form.append('file', new Blob([data], { type: mimeType }), 'audio.ogg');
  form.append('type', mimeType);
  form.append('messaging_product', 'whatsapp');
  
  const res = await fetch(
    `${WHATSAPP_API_URL}/${settings.whatsapp_phone_number_id}/media`,
    { method: 'POST', headers: { Authorization: `Bearer ${settings.whatsapp_access_token}` }, body: form }
  );
  
  const { id: mediaId } = await res.json();
  return mediaId;
}
```

Case `audio` atualizado:
```ts
case 'audio':
  const mediaId = await uploadMediaToWhatsApp(settings, supabase, queueItem.media_url, 'audio/ogg');
  payload.type = 'audio';
  payload.audio = { id: mediaId };
  break;
```

#### 2. `api.sendAudioMessage` — padrão igual a `sendFileMessage`

- Upload blob para `whatsapp-media/chat-uploads/{convId}/{ts}.webm`
- Get public URL
- Insert `messages`: `type: 'audio'`, `from_type: 'human'`, `status: 'processing'`
- Insert `send_queue`: `message_type: 'audio'`, `media_url`, `message_id`, `from_type: 'human'`
- Invoke `whatsapp-sender`

#### 3. `AudioRecorder` simplificado

- Remove import de `supabase` e chamada a `simulate-audio-webhook`
- Props: `onSend(blob: Blob)` e `onCancel`
- Ao clicar enviar: chama `onSend(blob)` com o blob gravado

#### 4. `ChatInterface` conecta tudo

```ts
const handleAudioSend = async (blob: Blob) => {
  await sendAudioMessage(activeChat.id, blob);
  setIsRecording(false);
};
```

### Checklist de teste

1. Gravar áudio → aparece no chat como "enviando" → status muda para "sent"
2. Cliente recebe áudio no WhatsApp (número diferente do business)
3. Nina NÃO responde automaticamente
4. Conferir no log do sender: "Uploaded media to WhatsApp, ID: ..."

