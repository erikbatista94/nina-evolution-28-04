## Objetivo

Adicionar um novo bloco **"Origem dos Leads (Como conheceu a GG)"** na aba **Avançado** do Relatório, permitindo que a equipe de tráfego pago veja claramente de onde os leads estão vindo e a performance de cada canal.

## O que será adicionado

### 1. Bloco visual no `Reports.tsx` (aba Avançado)

Posicionado logo após o bloco **"Qualificação do Lead"** e antes de **"Objeções"**, com:

- **Cards resumo** dos top 4 canais (Instagram, Indicação, Google, WhatsApp Direto, etc.) com contagem e percentual.
- **Tabela detalhada** com: Canal · Leads · % do total · Qualificados (score ≥ 30) · Agendados · Taxa de conversão (agendamento/lead).
- **Botão "Exportar CSV"** dedicado, no mesmo padrão dos outros blocos (ideal para enviar ao time de tráfego pago).
- Respeita os filtros globais já existentes: **Período** (dias) e **Vendedor**.

### 2. Lógica de agregação

Reaproveita a query de `contacts` já feita em `loadAdvanced` (não adiciona round-trip novo). Adiciona:

- Agregação por `contacts.source` (campo já normalizado pelo trigger `normalize_contact_source`).
- Cruzamento com `lead_score` para contar qualificados por canal.
- Cruzamento com `appointments` (via `contact_id`) para taxa de agendamento por canal.
- Contatos sem `source` agrupados como **"Não informado"** (sinal claro pro time de tráfego de rastreamento ausente).

### 3. Tipagem

Estende a interface `AdvancedData` com:
```ts
sources: { source: string; leads: number; pct: number; qualified: number; appointments: number; conversionRate: number }[]
```

## Arquivos a alterar

- `src/components/Reports.tsx` — interface `AdvancedData`, lógica em `loadAdvanced`, novo bloco JSX, função `exportSourcesCSV`.

## Como testar

1. Acessar **Relatórios → Avançado** (admin).
2. Conferir o bloco **"Origem dos Leads"** com os canais ranqueados.
3. Trocar período/vendedor e ver os números atualizarem.
4. Clicar em **CSV** e validar o arquivo exportado para o time de tráfego.

**Custo estimado:** 3 créditos.