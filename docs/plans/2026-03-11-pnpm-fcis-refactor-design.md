# Design — Migration pnpm + Refactoring FC&IS

**Date:** 2026-03-11
**Statut:** Approuvé

## 1. Migration pnpm

- Supprimer `package-lock.json` + `node_modules/`
- Lancer `pnpm install` → génère `pnpm-lock.yaml`
- Aucun changement de code nécessaire

## 2. Nouvelle structure `src/lib/`

```
src/lib/
├── core/                          # Fonctions pures, ZÉRO import de shell/
│   ├── types/                     # ← déplacé tel quel depuis types/
│   │   ├── mission.ts
│   │   ├── connector.ts
│   │   ├── tjm.ts
│   │   └── profile.ts
│   ├── scoring/                   # ← déplacé tel quel (déjà pur)
│   │   ├── relevance.ts
│   │   └── dedup.ts
│   ├── tjm/
│   │   └── aggregator.ts          # UNIQUEMENT aggregateFromPoints(points, title, location, now)
│   └── connectors/
│       └── freework-parser.ts     # UNIQUEMENT parseFreeWorkHTML(html, now, idPrefix)
│
└── shell/                         # I/O, async, side effects
    ├── storage/                   # ← déplacé tel quel
    │   ├── db.ts
    │   ├── chrome-storage.ts
    │   └── tjm-cache.ts           # ← déplacé depuis tjm/cache.ts
    ├── messaging/                 # ← déplacé tel quel
    │   └── bridge.ts
    ├── connectors/                # Classes avec I/O
    │   ├── base.connector.ts
    │   ├── freework.connector.ts  # Utilise le parser pur + bridge
    │   ├── malt.connector.ts
    │   └── index.ts
    └── usecases/                  # NOUVEAU — orchestration
        └── analyze-tjm.ts         # Orchestre: cache → aggregate → LLM → cache
```

## 3. Détail des extractions Core/Shell

### `core/tjm/aggregator.ts`

Supprimer `aggregateTJMData()` (async+I/O). Ne garder que `aggregateFromPoints()` avec injection de `now: Date` :

```ts
export function aggregateFromPoints(
  points: TJMDataPoint[], title: string, location: string | null, now: Date
): AggregatedTJM | null
```

### `core/connectors/freework-parser.ts`

Extraire `parseFreeWorkHTML()` avec injection :

```ts
export function parseFreeWorkHTML(
  html: string, now: Date, idPrefix: string
): Mission[]
```

### `shell/usecases/analyze-tjm.ts`

Nouveau use case qui orchestre :
1. Check cache (`shell/storage/tjm-cache.ts`)
2. Lire les data points (`shell/storage/db.ts`)
3. Agréger (appel Core pur `aggregateFromPoints`)
4. Appeler le LLM (fetch en Shell)
5. Cacher le résultat

### `shell/connectors/freework.connector.ts`

Importe le parser pur, injecte `new Date()` et le prefix d'ID.

### `tjm/llm-analyzer.ts`

Supprimé. La logique de fetch va dans le use case `analyze-tjm.ts`.

## 4. Mise à jour des imports

Tous les fichiers qui importent depuis `$lib/types/`, `$lib/scoring/`, etc. sont mis à jour vers `$lib/core/types/`, `$lib/core/scoring/`, etc. Idem pour les imports Shell.

## 5. Tests

- Tests existants mis à jour pour pointer vers `core/`
- `aggregator.test.ts` : tester uniquement `aggregateFromPoints()` avec `now` injecté, zéro mock
- `freework.test.ts` : tester `parseFreeWorkHTML()` avec `now` et `idPrefix` injectés
