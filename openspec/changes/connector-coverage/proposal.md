# Proposal: Connector Test Coverage Audit

## Why

Les connecteurs sont le point de fragilité #1 de MissionPulse (DOM externe qui casse). Les **parsers Core** (`core/connectors/*-parser.ts`) sont bien testés sans mock, mais il manque une vue d'ensemble de la couverture réelle par connecteur et des cas limites (champs manquants, formats inattendus, encodages). Le précédent context `comprehensive-improvements` listait "Vérification de la couverture des connecteurs" en TODO non fait.

## What Changes

1. **Audit** : pour chaque connecteur actif (free-work, lehibou, hiway, collective, cherry-pick), lister :
   - Parser Core: branches couvertes vs manquantes
   - Extractors (TJM, seniority, stack, location)
   - Cas limites: HTML malformé, champs null, doublons, encodage
2. **Combler les gaps** constatés (tests additionnels, pas de nouveau code sauf bug)
3. **Ajouter une fixture de HTML réel** si manquante pour chaque plateforme (anonymisée)
4. **Documenter** le niveau de couverture attendu par connecteur (un tableau dans ce proposal à la fin)

## Current State (mesuré le 2026-06-27)

```
tests/unit/connectors/  → freework, lehibou, hiway, collective, cherrypick présents
tests/fixtures/         → HTML scrapé + datasets
Aucune métrique de couverture par connecteur n'est tracée
```

Connecteurs actifs confirmés (post code-cleanup) : `free-work`, `lehibou`, `hiway`, `collective`, `cherry-pick`.

## Approach

1. Lancer `pnpm test:coverage` et extraire la couverture par fichier `core/connectors/*-parser.ts`
2. Comparer branches manquantes vs cas réels observés (fixtures HTML)
3. Pour chaque gap : ajouter un test ciblé (style Chicago — données pures, pas de mock)
4. Si une fixture HTML réelle manque pour un connecteur → en créer une depuis le HTML scrapé (anonymiser les données personnelles)

## Constraints

- Parsers Core testés **sans mock** (HTML en string, `now` et `idPrefix` injectés)
- Fixtures anonymisées (pas de données personnelles IRL dans le repo)
- Pas de `any` — typer les fixtures
- Un test = un cas documenté (AAA: Arrange/Act/Assert)

## Out of Scope

- Tests Shell des connecteurs (I/O `fetch`/cookies) — couverture E2E via dev-stubs
- Refactor des parsers (sauf si un bug est révélé → corriger)

## Verification

```bash
pnpm --filter @pulse/extension test:coverage
# Vérifier couverture par parser Core ≥ 90% branches
pnpm --filter @pulse/extension test
pnpm --filter @pulse/extension typecheck
```

Livrable final: tableau de couverture par connecteur ajouté à la section "Results" de ce proposal.
