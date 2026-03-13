

## Plano: Rebranding completo para GG (Gesso Gilmar)

Baseado no site www.gessogilmar.com.br, a identidade visual da GG usa **vermelho como cor primária**, fundo escuro, e o logo com selo circular + texto "GG Gesso, Forros e Iluminação".

### 1. Substituir logos e ícones
- **Sidebar**: Trocar `icon-via.png` e `logo-via-white.png` pelo logo GG (selo + logo horizontal branco do site)
- **Página de Login (Auth.tsx)**: Trocar o ícone VIA pelo logo GG
- **Favicon**: Atualizar para o selo GG
- Salvar os assets do CDN da GG no projeto (`src/assets/logo-gg.png`, `src/assets/logo-gg-white.svg`, `src/assets/icon-gg.png`)

### 2. Paleta de cores (index.css)
Atualizar as CSS variables para refletir o vermelho da GG:
- `--primary`: de cyan (`187 85% 53%`) para vermelho GG (~`0 72% 50%`)
- `--accent`: ajustar para um tom complementar (vermelho escuro ou dourado)
- `--ring`: acompanhar o primary
- Atualizar sidebar variables correspondentes

### 3. Referências hardcoded de cores
Vários componentes usam cores cyan/teal diretamente (classes Tailwind como `text-cyan-400`, `bg-cyan-500`, etc.):
- **Dashboard.tsx**: gradientes, tooltips, glows
- **Sidebar.tsx e ui/sidebar.tsx**: active states, hover colors, glow effects
- **Auth.tsx**: gradient do logo container
- **index.css**: scrollbar colors

Trocar todas as referências `cyan`/`teal` por `red`/cores da GG.

### 4. Textos e título
- **index.html**: Atualizar `<title>` para "GG | Sistema de Gestão"
- **Sidebar**: Default company name de "Minha Empresa" para "GG"
- **Auth.tsx**: Atualizar textos de boas-vindas se necessário

### 5. Corrigir erros de build existentes
Há diversos erros TypeScript pré-existentes (null vs undefined) em Team.tsx, api.ts, etc. que precisam ser corrigidos para o app funcionar.

### Arquivos a modificar
- `src/index.css` — paleta de cores
- `src/components/Sidebar.tsx` — logos + cores
- `src/components/ui/sidebar.tsx` — cores hardcoded
- `src/pages/Auth.tsx` — logo + cores
- `src/components/Dashboard.tsx` — cores hardcoded
- `index.html` — título
- Assets novos: logos GG baixados do CDN
- Correções TypeScript em `src/services/api.ts`, `src/components/Team.tsx`, `src/components/TeamConfigModal.tsx`, etc.

