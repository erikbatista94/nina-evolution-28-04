## Causa raiz encontrada

**Caso Lucas Braga:** Está cadastrado com `weight = 0` na tabela `team_members`. O trigger `assign_conversation_round_robin` filtra explicitamente `weight > 0`, então Lucas é **excluído de toda atribuição automática**. Os 3 leads que ele tem foram atribuições manuais. David (38) e Gabriel (37) recebem tudo, divididos quase 50/50 (peso 1/1, comportamento correto).

**Caso nome divergente da IA:** O `nina-orchestrator` monta o prompt com dados do contato e memória, mas **nunca injeta o `assigned_user_id` da conversa nem o nome real do vendedor**. Quando a IA escreve "vou te encaminhar para o Fulano", o nome é alucinação (ou cópia de algum exemplo do prompt). Não há ground-truth no contexto.

**Bug adicional na elegibilidade:** O trigger atual considera qualquer `team_member` com `status='active'` e `weight>0`, **sem filtrar por time**. Um agente do time Suporte com peso 1 entraria no round-robin de leads. A regra de negócio pedida exige `team = Vendas`.

---

## Parte 1 — Corrigir distribuição de leads

### 1a. Migration: novo critério de elegibilidade no trigger

Recriar `public.assign_conversation_round_robin()` adicionando filtro pelo time "Vendas":

```sql
SELECT tm.id, tm.user_id INTO selected_member
FROM public.team_members tm
JOIN public.teams t ON t.id = tm.team_id
WHERE tm.status = 'active'
  AND tm.weight > 0
  AND tm.user_id IS NOT NULL
  AND t.is_active = true
  AND lower(t.name) = 'vendas'
ORDER BY (tm.rr_counter::float / tm.weight) ASC, tm.name ASC
LIMIT 1;
```

Mantém a fórmula `rr_counter / weight` (já é weighted round-robin correto). Apenas restringe a fila aos vendedores do time **Vendas**, ativos, peso > 0 e com `user_id` vinculado.

### 1b. Corrigir o caso Lucas (dados, não código)

Atualizar `team_members` do Lucas Braga setando `weight = 1` (alinhar com David e Gabriel). Isso o devolve à fila imediatamente. Como `rr_counter` dele é 3 (vs 38 e 37), nas próximas ~35 conversas novas ele será priorizado pela fórmula até equalizar — exatamente o comportamento esperado de weighted round-robin.

### 1c. Painel de auditoria de distribuição (UI)

Criar `src/components/settings/LeadDistributionAudit.tsx` e adicionar como nova aba "Distribuição" em `Settings.tsx` (admin-only). Mostra para os últimos 7 / 30 dias:

- **Tabela por vendedor** (nome, time, status, peso, rr_counter, leads recebidos no período, % do total, última atribuição)
- **Linha de elegibilidade**: badge verde "Elegível" / vermelho "Fora da fila" + motivo (peso 0, time errado, status inativo, sem user_id)
- **Bloco resumo**: total de conversas no período, conversas sem `assigned_user_id`, vendedores elegíveis ativos
- **Botão "Recalcular elegibilidade"** que apenas re-roda a query (não altera dados)

Fontes: `team_members` + `teams` + `conversations` agregadas por `assigned_user_id` e `created_at` no período.

---

## Parte 2 — IA usa apenas o nome real do vendedor atribuído

### 2a. Injetar vendedor real no contexto do prompt (nina-orchestrator)

Em `processQueueItem` (linha ~694), expandir o select de `conversations` para incluir o vendedor atribuído:

```ts
.select(`
  *,
  contact:contacts(*),
  assigned_user:assigned_user_id (
    // não dá pra fazer join direto em auth.users; resolver via team_members
  )
`)
```

Como não há FK para `auth.users`, fazer um **segundo lookup** após carregar a conversa:

```ts
let assignedSeller: { name: string } | null = null;
if (conversation.assigned_user_id) {
  const { data: tm } = await supabase
    .from('team_members')
    .select('name')
    .eq('user_id', conversation.assigned_user_id)
    .eq('status', 'active')
    .maybeSingle();
  if (tm?.name) assignedSeller = { name: tm.name };
}
```

### 2b. Instruções rígidas no prompt

Após `buildEnhancedPrompt`, anexar um bloco de regras:

```
[VENDEDOR ATRIBUÍDO À CONVERSA]
{se houver}: Nome real: "{assignedSeller.name}". Quando precisar mencionar
quem dará continuidade, use EXATAMENTE este nome. Nunca invente ou troque.

{se não houver}: Nenhum vendedor foi atribuído ainda. Você está PROIBIDA de
citar qualquer nome de vendedor. Use frase neutra, exemplo:
"vou encaminhar seu atendimento para um consultor da nossa equipe".
```

Esse bloco é injetado dinamicamente por conversa, então sobrescreve qualquer exemplo estático do prompt base.

### 2c. Sanitização defensiva pós-resposta (cinto + suspensório)

Antes de enviar a resposta da IA para a fila de envio, rodar um regex leve:
- Se `assignedSeller` existe: nada a fazer.
- Se `assignedSeller` é `null` e o texto contém padrões como `"para o <Nome>"`, `"com o <Nome>"`, `"o <Nome> vai"` em contexto de encaminhamento, substituir por `"para um consultor da nossa equipe"`. Loga em `conversation_events` (`event_type='ai_name_sanitized'`) para auditoria.

Implementação: helper `sanitizeSellerMention(text, assignedSeller)` no próprio `nina-orchestrator/index.ts`.

---

## Parte 3 — Garantir ordem: atribuição antes da mensagem

A atribuição já acontece via trigger `BEFORE INSERT` em `conversations` (síncrono no banco), portanto quando o orchestrator carrega a conversa o `assigned_user_id` já está preenchido (se houver vendedor elegível). Para blindar o caso de race ou de conversas antigas sem atribuição:

- No início de `processQueueItem`, se `conversation.status='nina'` e `assigned_user_id IS NULL`, **tentar reatribuir on-demand** chamando uma RPC `public.assign_conversation_now(conversation_id uuid)` que reusa a mesma lógica do trigger. Só então segue para gerar a resposta.
- Se mesmo assim não houver vendedor elegível (fila vazia), seguir com `assignedSeller = null` (mensagem neutra).

Isso elimina a janela onde a IA poderia gerar mensagem antes da atribuição estar concluída.

---

## Arquivos que serão alterados

- **Migration nova** (SQL): recria `assign_conversation_round_robin` com filtro time=Vendas; cria RPC `assign_conversation_now`.
- **Data update** (insert tool): seta `weight=1` no `team_members` do Lucas Braga.
- **`supabase/functions/nina-orchestrator/index.ts`**: lookup do vendedor atribuído, injeção do bloco no prompt, sanitização defensiva, reatribuição on-demand.
- **`src/components/settings/LeadDistributionAudit.tsx`** (novo): painel de auditoria.
- **`src/components/Settings.tsx`**: adicionar aba "Distribuição" (admin-only).

---

## Como testar

**Distribuição (Preview):**
1. Abrir Settings → Distribuição. Confirmar que Lucas, David e Gabriel aparecem como "Elegível" após o ajuste de peso.
2. Confirmar que Erik (admin, sem time) aparece como "Fora da fila — sem time Vendas".
3. Criar 6 contatos de teste (ou esperar leads reais). Verificar que a coluna "leads recebidos" se distribui ~2/2/2 (peso igual).
4. Setar peso de David = 2, Gabriel = 1, Lucas = 1 → próximas 4 atribuições devem ir 2:1:1.

**Nome do vendedor (Preview):**
1. Abrir uma conversa com vendedor atribuído (qualquer um), forçar a IA a chegar no momento de encaminhamento (pedir "quero falar com um humano").
2. Confirmar que o nome citado na resposta = nome do `assigned_user_id` (visível no painel lateral do chat).
3. Repetir em conversa SEM `assigned_user_id` (ex: forçar via SQL `UPDATE conversations SET assigned_user_id=NULL WHERE id=...`). A IA deve dizer "consultor da nossa equipe" e nunca um nome próprio.
4. Checar `conversation_events` por `event_type='ai_name_sanitized'` para ver se o sanitizador disparou.

---

## Custo estimado

5 créditos.
