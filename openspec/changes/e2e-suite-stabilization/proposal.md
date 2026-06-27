# Proposal: E2E Suite Stabilization

## Why

La suite E2E Playwright a **22 échecs sur 117 tests**. Contrairement à ce que les contextes historiques suggéraient, ce n'est **PAS** une race condition du bootstrap dev-stubs — l'E2E démarre correctement (webServer vite + DevPanel injection fonctionnent). Les échecs sont de la **dérive de contrat** entre les tests et l'UI/code actuel : textes changés (`Radar TJM`), comportements modifiés (onboarding single-screen), selectors périmés, et quelques tests de performance flaky.

Un suite E2E rouge dégrade la confiance et bloque l'ajout de nouveaux tests E2E (Workstream C).

## What Changes

- Diagnostiquer chaque échec: **dérive test** (test à mettre à jour) vs **bug produit** (code à corriger) vs **flake** (test à fiabiliser)
- Réaligner les tests sur le contrat UI actuel (textes FR, rôles ARIA, data-testid)
- Fiabiliser les tests de performance (scroll/timeout)
- Atteindre une suite E2E **verte en local headless**

## Current State (mesuré le 2026-06-27)

```
pnpm --filter @pulse/extension exec playwright test
→ 95 passed, 22 failed (59.6s), 117 tests
```

Bootstrap E2E **fonctionne** : webServer `:5176`, DevPanel Ctrl+Shift+D, helpers `setFeedState`/`injectMissions` opérationnels.

### Les 22 échecs (par fichier)

| Fichier                            | # échecs | Hypothèse catégorie                 |
| ---------------------------------- | -------- | ----------------------------------- |
| `accessibility/a11y.test.ts`       | 4        | Sélecteurs ARIA / structure clavier |
| `applications-pipeline.test.ts`    | 1        | Comportement pipeline               |
| `devpanel.test.ts`                 | 1        | Toggle onboarding                   |
| `export.test.ts`                   | 3        | Toast d'erreur favoris vides        |
| `feed.test.ts`                     | 1        | Favorites toggle                    |
| `flows/full-user-journey.test.ts`  | 1        | Flow end-to-end                     |
| `linkedin-import.test.ts`          | 3        | Preview / permissions               |
| `navigation.test.ts`               | 1        | `Radar TJM` text drift (confirmé)   |
| `onboarding.test.ts`               | 1        | Single-screen onboarding drift      |
| `performance/virtual-list.test.ts` | 3        | Scroll/rendu perf flaky             |
| `settings.test.ts`                 | 1        | Section "local AI status"           |
| `tjm.test.ts`                      | 2        | Empty state + dashboard data        |

### Exemple confirmé (navigation.test.ts:46)

```ts
await nav.getByRole('button', { name: 'TJM' }).click();
await expect(page.getByText('Radar TJM')).toBeVisible(); // ❌ text changed
```

## Constraints

- **Tests alignés sur l'UI réelle**, pas l'inverse — sauf si l'échec révèle un vrai bug produit (alors corriger le code)
- Préserver les helpers partagés (`tests/e2e/helpers.ts`) — étendre, ne pas casser
- Sélecteurs stables: privilégier `getByRole` + ARIA ; `data-testid` si pas de sémantique
- Pas de `.skip()`/`.only()` pour faire passer — chaque fix doit être justifié
- Performance tests: tolérance explicite ou suppression si la métrique n'est plus pertinente (ex: `content-visibility` a remplacé le virtual scroll JS → les tests "only renders visible items" peuvent être obsolètes)

## Out of Scope

- Ajouter de NOUVEAUX tests E2E (→ Workstream C `missing-test-coverage`)
- Refactorer l'UI pour coller à d'anciens tests (les tests suivent le produit)

## Verification

```bash
pnpm --filter @pulse/extension exec playwright test
# Objectif: 117 passed, 0 failed (local headless)
```

Relancer 2× pour exclure les flakes résiduels.
