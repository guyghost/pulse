# Proposal: Missing Test Coverage

## Why

Plusieurs modules Shell et scénarios critiques n'ont **aucun test**, laissant des régressions silencieuses passer en production. Le plus flagrant : `parser-health.ts` (détection d'anomalies de parsing) a **0 test** alors qu'il est au cœur de la fiabilité des connecteurs. Il manque aussi des scénarios E2E sur les flux de scan en erreur.

> **Dépendance** : ce workstream s'exécute **après** `e2e-suite-stabilization` (on n'ajoute pas de tests E2E à une suite rouge).

## What Changes

### A. Tests Shell pour `parser-health.ts`

`src/lib/shell/scan/parser-health.ts` (120 lignes, 0 tests) track la santé des connecteurs :

- `trackParserHealth(connectorId, missionCount, now)` → détecte `previousCount > 0 && missionCount === 0`
- `consecutiveZeros` ≥ 5 = parser possiblement cassé
- Persistance `chrome.storage.local`

**Problème**: la logique de décision (`isSuspicious`, `consecutiveZeros`) est noyée dans le Shell avec I/O `chrome.storage`, donc non testable sans mock lourd.

**Solution recommandée** (FC&IS) :

1. **Extraire** la logique pure de décision dans `src/lib/core/scoring/parser-health-logic.ts` (ou `core/connectors/`) — fonction pure `evaluateParserHealth(prev, missionCount, now): { isSuspicious, consecutiveZeros, warning }`
2. Le Shell (`parser-health.ts`) délègue le calcul au Core et ne garde que l'I/O storage
3. **Tester le Core sans mock** (cas: 0→0, >0→0, >0→>0, seuil consecutiveZeros=5, reset)
4. **Tester le Shell avec mock `chrome.storage`** (load/save round-trip)

### B. Scénarios E2E scan en erreur

`tests/e2e/resilience/connector-failure.test.ts` existe (6 tests) mais couvre principalement le bon chemin. Manquent :

- Scan où un connecteur retourne 0 missions après en avoir eu >0 → warning parser-health
- Scan où tous les connecteurs échouent → état `error` global + retry
- Reprise après échec partiel

## Current State (mesuré le 2026-06-27)

```
parser-health.ts           → 0 tests (confirmé via find)
tests/unit/scan/           → scanner.test.ts, rescore.test.ts existent
tests/e2e/resilience/      → connector-failure.test.ts (6 tests, passent)
```

## Constraints

- **FC&IS strict** : la logique de décision va dans le Core (zéro I/O, `now` injecté)
- Tests Core **sans mock** (Chicago school — state-based)
- Tests Shell avec mock `chrome.storage` minimal (réutiliser le setup `tests/unit/setup.ts`)
- E2E après que la suite soit verte (dépendance Workstream A)
- Pas de `Date.now()` dans le Core — injecter `now: number`

## Out of Scope

- Couverture exhaustive des connecteurs (→ Workstream D `connector-coverage`)
- Mock de `fetch` réseau (tests E2E couvrent déjà via dev-stubs)

## Verification

```bash
pnpm --filter @pulse/extension test                # nouveaux tests unitaires parser-health passent
pnpm --filter @pulse/extension test:e2e            # nouveaux scénarios résilience passent
pnpm --filter @pulse/extension typecheck
```

Couverture ciblée : `parser-health` Core logic à 100% des branches de décision.
