# Proposal: Code Quality Cleanup

## Why

Le codebase est en bon état (typecheck ✅, format Prettier ✅) mais ESLint lève encore **9 warnings** qui polluent le signal CI et seront bloqués à terme si on promeut les règles en erreurs. Aucun n'est critique, mais ils représentent soit du code mort, soit des assertions `!` dangereuses.

## What Changes

- Éliminer les 9 warnings ESLint restants dans `apps/extension`
- Distinguer **suppression légitime** (préfixer `_`) vs **code mort** (supprimer) vs **refactor** (retirer `!`)
- Conserver `0 errors / 0 warnings` comme nouveau baseline

## Current State (mesuré le 2026-06-27)

```
apps/extension lint → 0 errors, 9 warnings
apps/extension typecheck → exit 0 ✅
pnpm format:check → All files use Prettier code style ✅
```

### Les 9 warnings

| Fichier                                                  | Ligne    | Warning                                   | Action attendue                                                 |
| -------------------------------------------------------- | -------- | ----------------------------------------- | --------------------------------------------------------------- |
| `scripts/verify-manifest.ts`                             | 153, 155 | `no-non-null-assertion` ×2                | Refactor: remplacer `!` par guard explicite ou `throw`          |
| `src/background/index.ts`                                | 6        | `getMissionById` unused                   | Code mort → supprimer l'import/handler OU `_`-prefix si réservé |
| `src/background/index.ts`                                | 75       | `setTrackingNextActionAt` unused          | Vérifier si handler de message fantôme → supprimer              |
| `src/background/index.ts`                                | 76       | `addGeneratedAssetAndMarkPrepared` unused | Idem                                                            |
| `src/background/index.ts`                                | 79       | `saveGeneratedAsset` unused               | Idem                                                            |
| `src/background/index.ts`                                | 82       | `GeneratedAsset` (type) unused            | Idem                                                            |
| `src/lib/shell/profile-extractors/linkedin.extractor.ts` | 150      | `skills` assigned but unused              | Code mort local → supprimer                                     |
| `src/lib/state/feed-page.svelte.ts`                      | 29       | `getMissions` unused export               | Supprimer l'export mort                                         |

> Note: les 4 handlers `tracking*`/`GeneratedAsset*` dans `background/index.ts` suggèrent une feature partiellement supprimée. **Investiguer** avant de supprimer — il faut confirmer qu'aucun message bridge ne les référence.

## Constraints

- Architecture FC&IS respectée (pas de Core → Shell)
- TypeScript strict (pas de `any`)
- Ne pas casser les tests unitaires existants
- Conventional commits (`chore(lint):` / `refactor:`)

## Out of Scope

- Promouvoir les règles ESLint en erreurs (discussion séparée)
- Ajouter du linting sur `apps/landing` / `apps/dashboard` (pas de config ESLint aujourd'hui — uniquement Prettier)
- Couverture de tests

## Verification

```bash
pnpm --filter @pulse/extension lint        # → 0 problems
pnpm --filter @pulse/extension typecheck   # → exit 0
pnpm --filter @pulse/extension test        # → tous passent
```
