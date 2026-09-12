# ADR-001 : Functional Core, Imperative Shell

## Statut

Accepté

## Contexte

MissionPulse est une extension Chrome s'exécutant dans 2 contextes principaux (Service Worker, Side Panel). Partager l'état et déboguer entre ces contextes est difficile. Il nous fallait une architecture maximisant la testabilité et gardant la logique métier prévisible, malgré un environnement d'extension Chrome intrinsèquement riche en effets de bord.

## Décision

Adopter le pattern Functional Core, Imperative Shell (FC&IS) :

- **Core** (`src/lib/core/`) : fonctions pures uniquement. Parsers (`core/connectors/*-parser.ts`), scoring/déduplication (`core/scoring/`), définitions de types, types d'erreurs et transformations de données. Pas d'I/O, pas de `Date.now()`, pas de `console.log` — les timestamps sont injectés en paramètres.
- **Shell** (`src/lib/shell/`) : tous les effets de bord. Connecteurs effectuant les fetchs HTTP, accès IndexedDB/chrome.storage, bridge de messaging Chrome et services de notification.

La frontière est appliquée par convention : les modules Core n'importent jamais depuis le Shell. Le Shell importe les types du Core et appelle les fonctions pures du Core pour transformer les données.

Exemples :

- `core/connectors/freework-parser.ts` (transformation pure HTML → Mission) vs `shell/connectors/freework.connector.ts` (récupère le HTML, appelle le parser)
- `core/errors/app-error.ts` (définitions de types + factory functions) vs `shell/errors/error-handler.ts` (logging, effets de bord toast)

## Conséquences

- **Positif** : les fonctions du Core sont trivialement testables en unitaire sans mocks. Les parsers se testent avec des fixtures HTML. La logique de scoring est déterministe. La surface de bug des problèmes inter-contextes est confinée au Shell.
- **Positif** : les erreurs sont des objets simples sérialisables (requis pour `postMessage` entre contextes), ce que le pattern Core pur encourage naturellement.
- **Négatif** : demande de la discipline pour garder le Core pur. Les nouveaux contributeurs doivent comprendre la frontière.
- **Négatif** : une certaine duplication entre les types Core et les wrappers Shell (paires parser + connecteur par exemple).
