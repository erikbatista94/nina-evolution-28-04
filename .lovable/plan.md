

## Plano: Remover Onboarding Wizard Completamente

### Mudanças

#### 1. `src/App.tsx` — Remover OnboardingWizard e estado relacionado

- Remover import de `OnboardingWizard` e `useOnboardingStatus`
- Remover `useState(showOnboarding)` e `useEffect` que abre o wizard
- Remover `<OnboardingWizard>` do render
- Remover `showOnboarding`/`setShowOnboarding` do Outlet context (simplificar ou remover)

#### 2. `src/components/Dashboard.tsx` — Remover OnboardingBanner

- Remover import de `OnboardingBanner`
- Remover `useOutletContext` (não precisa mais de `setShowOnboarding`)
- Remover `<OnboardingBanner>` do render

#### 3. `src/components/Settings.tsx` — Remover botão "Refazer Onboarding"

- Remover import de `useOnboardingStatus`
- Remover `useOutletContext`, `resetWizard`, `handleReopenOnboarding`
- Remover botão "Refazer Onboarding" da UI

#### 4. Arquivos que podem ser deletados (ou mantidos inativos)

Não precisa deletar, mas ficam sem uso:
- `src/components/OnboardingWizard.tsx`
- `src/components/OnboardingBanner.tsx`
- `src/hooks/useOnboardingStatus.ts`
- `src/components/onboarding/Step*.tsx` (7 arquivos)

#### 5. Sidebar + AdminRoute (já implementados)

Verificar que já estão funcionando:
- Sidebar já filtra "Configurações" por `isAdmin`
- `AdminRoute` já protege `/settings`
- Nenhuma mudança adicional necessária

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/App.tsx` | Remover wizard, estado, e outlet context de onboarding |
| `src/components/Dashboard.tsx` | Remover banner e outlet context |
| `src/components/Settings.tsx` | Remover botão "Refazer Onboarding" e hooks relacionados |

