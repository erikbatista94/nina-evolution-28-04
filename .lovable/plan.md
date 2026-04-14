

## 3 Melhorias Novas (5 créditos no total)

### 1. Exportação Rápida de Contatos (CSV)
**Por que é boa:** A operação comercial frequentemente precisa exportar leads para planilhas, campanhas de marketing ou relatórios externos. Hoje não existe nenhuma forma de fazer isso no sistema.
**O que muda:** Botão "Exportar CSV" no header da tela de Contatos. Gera download instantâneo com: nome, telefone, email, temperatura, tipo de cliente, tags, cidade, responsável, data do último contato.
**Esforço:** Baixo (frontend only, dados já estão carregados no componente)
**Risco:** Baixo

### 2. Resumo Automático da Conversa no Card do Pipeline
**Por que é boa:** Hoje o vendedor precisa abrir o drawer do deal para entender o contexto. Um resumo de 1 linha extraído do `client_memory.interaction_summary` direto no card do Kanban dá contexto imediato sem clique.
**O que muda:** Cada card do Kanban exibe uma linha tipo "Cliente interessado em porcelanato, aguardando orçamento" usando dados que já existem no banco.
**Esforço:** Baixo (frontend only, dados já vêm no deal/contact)
**Risco:** Baixo

### 3. Painel de Follow-ups Pendentes no Dashboard
**Por que é boa:** Vendedores esquecem de retornar para leads. Um bloco no Dashboard mostrando "5 leads sem resposta há +24h" com link direto para a conversa reduziria perda de oportunidades.
**O que muda:** Novo bloco no Dashboard que consulta conversas onde a última mensagem é do cliente e tem mais de 24h sem resposta do vendedor. Cada item é clicável e leva direto ao chat.
**Esforço:** Baixo (query simples + componente pequeno)
**Risco:** Baixo

---

### Arquivos afetados
- **Melhoria 1:** `src/components/Contacts.tsx` — botão + função `downloadCSV`
- **Melhoria 2:** `src/components/Kanban.tsx` — linha de resumo no card
- **Melhoria 3:** `src/components/Dashboard.tsx` ou `src/components/DashboardMyDay.tsx` — novo bloco de follow-ups

Todas são frontend-only, sem migrations, sem edge functions.

