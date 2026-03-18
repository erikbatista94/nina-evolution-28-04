

## Plano: Gravação de Áudio + Emoji Picker no Chat

### 1. Gravação de Áudio (estilo WhatsApp)

**Novo componente `src/components/AudioRecorder.tsx`**:
- Usa `navigator.mediaDevices.getUserMedia({ audio: true })` + `MediaRecorder` API
- UI durante gravação substitui a barra de input: lixeira (cancelar), indicador vermelho pulsante + timer, botão enviar
- Ao enviar: converte blob → base64, chama `simulate-audio-webhook` edge function
- Botão microfone aparece ao lado do botão enviar quando input está vazio

**Editar `src/components/ChatInterface.tsx`**:
- Importar `AudioRecorder`, adicionar estado `isRecording`
- Quando `isRecording=true`, mostrar `AudioRecorder` no lugar do form de input
- Botão microfone no rodapé do input (ao lado do botão enviar)

### 2. Fix Emoji Picker (não clicável)

O botão de emoji está **propositalmente desabilitado** (`disabled`, `cursor-not-allowed`, `opacity-50`, título "Em breve: Emoji picker"). Não é um bug — foi implementado como placeholder.

**Solução**: Implementar um emoji picker funcional usando um popover com emojis comuns.

- Remover `disabled`, `cursor-not-allowed`, `opacity-50` do botão
- Criar um `Popover` com grid de emojis organizados por categoria (Smileys, Gestos, Corações, etc.)
- Ao clicar num emoji, inserir no campo de mensagem na posição do cursor
- Fechar popover após seleção

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/AudioRecorder.tsx` | Novo: gravação de áudio estilo WhatsApp |
| `src/components/ChatInterface.tsx` | Integrar microfone + emoji picker funcional |

