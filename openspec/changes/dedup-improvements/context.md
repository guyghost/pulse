# Context: Dedup Improvements

## Objective

Améliorer l'algorithme de déduplication pour mieux gérer les missions proxy (revendeurs) et prefers les sources directes.

## Problèmes identifiés

| Problème                                                                           | Impact                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------- |
| Free-Work affiche des missions de CherryPick comme si c'était ses propres missions | Confusion, qualité inférieure               |
| Jaccard simple ne capture pas la similarité sémantique                             | Faux positifs/negatifs                      |
| Pas de priorisation par source                                                     | Pas de préférence pour les sources directes |
| Les localisations incompatibles ne sont pas détectées                              | Missions différentes fusionnées par erreur  |

## Solutions implémentées

### 1. Détection des proxy clients

```typescript
const PROXY_CLIENT_NAMES = new Set([
  'cherrypick',
  'cherry pick',
  'freework',
  'free work',
  'lehibou',
  'le hibou',
  'hiway',
  'collective',
  'collectivework',
  'collective work',
]);
```

Quand un client est un proxy known, la comparaison est ajustée pour préferer la source directe.

### 2. Priorité des sources

```typescript
const SOURCE_CANONICAL_PRIORITY: Record<MissionSource, number> = {
  'cherry-pick': 5, // Source directe preferée
  lehibou: 4,
  hiway: 4,
  collective: 4,
  'free-work': 1, // Agrégateur - moins prioritaire
};
```

### 3. Similarité multi-champs pondérée

| Champ    | Pondération |
| -------- | ----------- |
| title    | 62%         |
| stack    | 18%         |
| client   | 10%         |
| location | 6%          |
| remote   | 2%          |
| tjm      | 2%          |

### 4. Validation des localisations

Les missions avec des localisations spécifiques incompatibles (Paris vs Lyon) NE sont PAS fusionnées, même si titre et stack sont identiques.

## Contraintes

- **Platform**: Chrome Extension Manifest V3
- **Framework**: Svelte 5 (runes only)
- **Architecture**: Functional Core & Imperative Shell
- **Tests**: 1156 tests unitaires
- **Core rules**: Zero I/O, zero async, zero impurity

## Décisions techniques

| Decision                                       | Justification                                                   | Agent         |
| ---------------------------------------------- | --------------------------------------------------------------- | ------------- |
| Stop words filtering                           | Supprime "de, du, la, le..." pour éviter le bruit               | @orchestrator |
| Legal client words filtering                   | Supprime "sa, sas, sasu, sarl..." des noms clients              | @orchestrator |
| URL normalization avec path validation         | same_url requiert un chemin spécifique                          | @orchestrator |
| deduplicateEnabledSources dans feed-controller | Les sources désactivées ne sont pas dédupliquées contre enabled | @orchestrator |

## Tests ajoutés

| Test                                                   | Description                         |
| ------------------------------------------------------ | ----------------------------------- |
| prefers direct Cherry Pick over Free-Work reseller     | CherryPick direct > Free-Work proxy |
| keeps same title/stack when locations are incompatible | Paris ≠ Lyon même si même mission   |

## Résultats

- **1156 tests passing** (80 test files, 0 failures)
- **0 TypeScript errors** (`pnpm tsc --noEmit` clean)
