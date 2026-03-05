

## Plano: Indicador visual de conexão realtime no Chat

### Localização atual

- **Hook**: `src/hooks/useConversations.ts` já expõe `realtimeConnected: boolean`
- **Componente**: `src/components/ChatInterface.tsx` linha 17 — atualmente **não** desestrutura `realtimeConnected`

### Implementação

**Arquivo: `src/components/ChatInterface.tsx`**

1. Desestruturar `realtimeConnected` do hook (linha 17)
2. Adicionar um indicador compacto no header da lista de conversas (ao lado do campo de busca), com 2 estados visuais:
   - **Conectado**: bolinha verde + tooltip "Realtime conectado"
   - **Desconectado**: bolinha vermelha pulsante + texto "Reconectando..." + tooltip explicativo

O indicador será um pequeno dot (8px) com animação `animate-pulse` quando offline, posicionado no canto superior da sidebar de conversas. Ao clicar quando desconectado, chama `refetch()` para forçar atualização manual.

### Teste

1. Abrir `/chat` — deve mostrar bolinha verde
2. Simular queda: desconectar internet → bolinha deve ficar vermelha pulsante com texto "Reconectando..."
3. Reconectar internet → bolinha volta a verde
4. Clicar na bolinha vermelha → deve forçar refresh das conversas

