# AGENTS.md — MissionPulse

## Projet

MissionPulse est une extension Chrome (Manifest V3) qui agit comme un agent au service du freelance tech. Elle scrappe les plateformes de missions via les sessions navigateur existantes et présente les résultats dans un feed centralisé avec scoring de pertinence et analyse sémantique via Gemini Nano (Chrome built-in AI).

## Stack

| Couche | Technologie | Version |
|--------|-------------|---------|
| UI | Svelte 5 (runes) | ^5.x |
| Styling | TailwindCSS 4 (CSS-first config) | ^4.x |
| State | XState 5 (actors, setup API) | ^5.x |
| Language | TypeScript (strict) | ^5.x |
| Build | Vite + @crxjs/vite-plugin | latest |
| Tests | Vitest + Playwright | latest |
| Runtime | Chrome Extension Manifest V3 | MV3 |
| Package manager | pnpm | latest |

## Architecture

### Functional Core & Imperative Shell

Le code métier dans `src/lib/` est séparé en deux couches :

```
src/lib/
├── core/                              # Fonctions PURES — zéro I/O, zéro async, zéro side effect
│   ├── types/                         # Types, interfaces, value objects
│   │   ├── mission.ts                 # Mission, MissionSource, RemoteType
│   │   ├── connector.ts               # PlatformConnector, ConnectorError, ConnectorStatus
│   │   └── profile.ts                 # UserProfile
│   ├── scoring/                       # Scoring et déduplication
│   │   ├── relevance.ts               # scoreMission(mission, profile) → 0-100
│   │   ├── semantic-scoring.ts        # Types pour le scoring sémantique
│   │   └── dedup.ts                   # deduplicateMissions(missions) → Mission[]
│   ├── seen/                          # Gestion des missions vues
│   │   └── mark-seen.ts               # markAsSeen(seenIds, newIds) → string[]
│   └── connectors/                    # Parsing HTML pur
│       ├── parser-utils.ts            # createMission(), parseTJM(), stripHtml()
│       ├── validate-parser-output.ts  # Validation runtime des outputs parser
│       └── freework-parser.ts         # parseFreeWorkHTML(html, now, idPrefix)
│
└── shell/                             # I/O, async, side effects, orchestration
    ├── storage/                       # Persistance
    │   ├── db.ts                      # IndexedDB (missions, profile, connector statuses)
    │   ├── chrome-storage.ts          # chrome.storage.local (settings, API key)
    │   ├── semantic-cache.ts          # Cache scores sémantiques (chrome.storage)
    │   └── seen-missions.ts           # IDs des missions déjà vues
    ├── ai/                            # Intégration IA
    │   └── semantic-scorer.ts         # Scoring sémantique via Gemini Nano
    ├── messaging/                     # Communication inter-contextes
    │   └── bridge.ts                  # chrome.runtime.sendMessage typé
    ├── connectors/                    # Connecteurs avec I/O
    │   ├── base.connector.ts          # Classe abstraite (chrome.cookies, chrome.storage)
    │   ├── freework.connector.ts      # Utilise le parser pur + fetch
    │   └── index.ts                   # Registry async des connecteurs
    ├── scan/                          # Orchestration scan
    │   ├── scanner.ts                 # runScan() - orchestration principale
    │   └── parser-health.ts           # Détection d'anomalies parser
    └── notifications/                 # Notifications Chrome
        └── notify-missions.ts         # Notifications pour missions à haut score
```

**Règle fondamentale : Shell appelle Core. Core n'appelle JAMAIS Shell. Core ignore que Shell existe.**

#### Core — Règles

- **Zéro I/O** : pas de `fetch`, `indexedDB`, `chrome.*`, `fs`
- **Zéro async** : pas de `async/await`, pas de `Promise`
- **Zéro impureté** : pas de `Date.now()`, `Math.random()`, `crypto`, `console.log`
- **Injection** : `Date`, IDs et tout ce qui est imprévisible est passé en paramètre
- **Testable sans mocks** : chaque fonction Core se teste avec des données pures

#### Shell — Règles

- Orchestre les appels I/O et délègue les calculs au Core
- Les use cases (`shell/usecases/`) combinent plusieurs étapes : lecture données → calcul Core → persistance
- Les connecteurs injectent `new Date()` et les préfixes d'ID au parser Core
- Toute gestion d'erreur technique (try/catch, retry) est dans le Shell

#### Imports

```typescript
// CORRECT : Shell importe Core
import { scoreMission } from '$lib/core/scoring/relevance';
import { deduplicateMissions } from '$lib/core/scoring/dedup';

// INTERDIT : Core importe Shell
import { getMissions } from '$lib/shell/storage/db'; // ← JAMAIS dans core/
```

### Contextes d'exécution Chrome

L'extension a **trois contextes isolés** qui communiquent via `chrome.runtime.sendMessage` :

1. **Service Worker** (`src/background/`) — Cerveau de l'extension. Héberge les machines XState globales (scan, connectors). Pas d'accès DOM. Orchestre les cycles de scan via `chrome.alarms`.

2. **Offscreen Document** (`src/offscreen/`) — Utilisé pour le scraping. A accès au DOM. Le service worker crée un offscreen document temporaire, lui envoie une URL à scrapper, récupère le résultat, puis le détruit. Un seul offscreen document actif à la fois (contrainte Chrome).

3. **Side Panel** (`src/sidepanel/`) — Interface utilisateur Svelte. Communique avec le service worker pour lire l'état des machines et déclencher des actions.

### Messaging entre contextes

Tout passe par `src/lib/shell/messaging/bridge.ts`. Convention :

```typescript
// Types de messages
type MessageType =
  | { type: 'SCAN_START' }
  | { type: 'SCAN_STATUS'; payload: ScanSnapshot }
  | { type: 'MISSIONS_UPDATED'; payload: Mission[] }
  | { type: 'SCRAPE_URL'; payload: { url: string; connectorId: string } }
  | { type: 'SCRAPE_RESULT'; payload: { missions: Mission[] } }
  | { type: 'GET_PROFILE' }
  | { type: 'SAVE_PROFILE'; payload: UserProfile }
```

Règle : le side panel n'appelle JAMAIS directement IndexedDB ou chrome.cookies. Tout passe par le service worker.

### Flux de données

```
[Side Panel]  →  message  →  [Service Worker]  →  message  →  [Offscreen Doc]
    UI Svelte        ↕              XState machines        ↕           DOM scraping
    $state/props     ↕              IndexedDB              ↕           Parse HTML
                  snapshot                                result
```

## Svelte 5 — Règles strictes

### Syntaxe obligatoire

```svelte
<script lang="ts">
  // Props : $props() uniquement
  let { label, count = 0 }: { label: string; count?: number } = $props();

  // État local : $state
  let isOpen = $state(false);

  // Dérivé : $derived
  let display = $derived(`${label}: ${count}`);

  // Effet : $effect
  $effect(() => {
    document.title = display;
  });

  // Events : attributs natifs
  function handleClick() { isOpen = !isOpen; }
</script>

<button onclick={handleClick}>{display}</button>
```

### Interdit

- `export let` → utiliser `$props()`
- `$:` reactive declarations → utiliser `$derived` ou `$effect`
- `writable()`, `readable()`, `derived()` stores → utiliser `$state` ou XState
- `on:click`, `on:input` → utiliser `onclick`, `oninput`
- `createEventDispatcher()` → utiliser callback props
- `$$props`, `$$restProps` → utiliser `...rest` avec `$props()`
- Slots nommés legacy → utiliser `{#snippet}` et `{@render}`

### Binding XState ↔ Svelte

Utiliser `@xstate/svelte` pour connecter les machines aux composants :

```svelte
<script lang="ts">
  import { useActor } from '@xstate/svelte';
  import { feedMachine } from '$lib/machines/feed.machine';

  const { snapshot, send } = useActor(feedMachine);

  let missions = $derived($snapshot.context.missions);
  let isLoading = $derived($snapshot.matches('loading'));
</script>
```

## XState 5 — Règles strictes

### Pattern obligatoire

Toujours utiliser `setup()` avant `createMachine()` :

```typescript
import { setup, assign, fromPromise } from 'xstate';

export const myMachine = setup({
  types: {
    context: {} as MyContext,
    events: {} as MyEvents,
  },
  actors: {
    fetchData: fromPromise(async ({ input }: { input: FetchInput }) => {
      // ...
    }),
  },
  actions: {
    setData: assign({
      data: ({ event }) => event.output,
    }),
  },
  guards: {
    hasData: ({ context }) => context.data.length > 0,
  },
}).createMachine({
  id: 'my-machine',
  initial: 'idle',
  context: { /* ... */ },
  states: { /* ... */ },
});
```

### Interdit

- `createMachine()` sans `setup()` — toujours wraper dans `setup()`
- `interpret()` — utiliser `createActor()`
- `services` en config objet — utiliser `actors` dans `setup()`
- String references sans déclaration dans `setup()` — tout doit être typé
- `send()` avec string — toujours `{ type: 'EVENT_NAME' }`

### Machines du projet

| Machine | Localisation | Contexte d'exécution | Rôle |
|---------|-------------|---------------------|------|
| `scan` | `src/background/machines/` | Service Worker | Orchestration du cycle de scan complet |
| `connector` | `src/background/machines/` | Service Worker | Lifecycle d'un connecteur (detect → fetch → done) |
| `feed` | `src/machines/` | Side Panel | État de l'affichage du feed |
| `onboarding` | `src/machines/` | Side Panel | Wizard de configuration initiale |
| `filters` | `src/machines/` | Side Panel | État des filtres actifs |

## TailwindCSS 4 — Config CSS-first

La configuration est dans `src/ui/design-tokens.css`, pas dans un fichier JS :

```css
@import "tailwindcss";

@theme {
  --color-navy-900: #0F172A;
  --color-navy-800: #1E293B;
  --color-navy-700: #334155;
  --color-surface: #1E293B;
  --color-surface-hover: #273548;
  --color-text-primary: #F8FAFC;
  --color-text-secondary: #94A3B8;
  --color-accent-blue: #3B82F6;
  --color-accent-emerald: #10B981;
  --color-accent-amber: #F59E0B;
  --color-accent-red: #EF4444;

  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

Interdit : `tailwind.config.js`, `tailwind.config.ts`, ou toute config JS/TS.

## Atomic Design — Structure des composants

```
src/ui/
├── atoms/          # Éléments indivisibles : Button, Badge, Icon, Chip, Skeleton
├── molecules/      # Combinaisons d'atomes : MissionCard, FilterBar
├── organisms/      # Sections autonomes : MissionFeed, ConnectorPanel
├── templates/      # Layouts de page : FeedLayout, SettingsLayout
└── pages/          # Pages complètes : FeedPage, SettingsPage
```

### Conventions de nommage

- Un fichier = un composant : `MissionCard.svelte`
- Props typées dans `$props()` avec interface inline ou importée
- Pas de logique métier dans les composants — déléguer aux machines XState ou aux modules `lib/core/`
- Les atomes ne connaissent pas XState. Les organisms et pages y accèdent.
- Les molecules reçoivent des données via props, jamais via import direct de machine

### Hiérarchie de responsabilité

| Niveau | Connaît XState ? | Appelle des services ? | Exemples |
|--------|-----------------|----------------------|----------|
| Atoms | Non | Non | Button, Badge, Icon |
| Molecules | Non | Non | MissionCard, FilterBar |
| Organisms | Oui (via `useActor`) | Via événements XState | MissionFeed, ConnectorPanel |
| Templates | Non (layout pur) | Non | FeedLayout |
| Pages | Oui (crée les actors) | Oui (init machines) | FeedPage, SettingsPage |

## Connecteurs — Pattern d'implémentation

L'interface `PlatformConnector` est définie dans le Core (`src/lib/core/types/connector.ts`). Les implémentations vivent dans le Shell (`src/lib/shell/connectors/`).

```typescript
// src/lib/core/types/connector.ts — Interface pure
export interface PlatformConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;

  detectSession(): Promise<boolean>;
  fetchMissions(): Promise<Mission[]>;
  getLastSync(): Promise<Date | null>;
}
```

Convention pour ajouter un connecteur :
1. Créer le parser pur dans `src/lib/core/connectors/{platform}-parser.ts` — fonction `parse{Platform}HTML(html, now, idPrefix)`
2. Créer le connecteur I/O dans `src/lib/shell/connectors/{platform}.connector.ts` — utilise le parser pur + bridge
3. Enregistrer dans `src/lib/shell/connectors/index.ts`
4. Ajouter le `host_permissions` dans `manifest.json`
5. Ajouter un test du parser dans `tests/unit/connectors/` (testable sans mocks)

Le scraping se fait via l'offscreen document. Le connecteur envoie un message au service worker avec l'URL cible, qui crée l'offscreen document, charge la page, et exécute le parsing DOM.

Quand un connecteur casse (DOM changé), il doit throw une `ConnectorError` typée. La machine `connector` passe en état `error` et notifie l'utilisateur. Les autres connecteurs continuent.

## Sémantique — Scoring via Gemini Nano

Le scoring sémantique utilise Gemini Nano (Chrome built-in AI) pour analyser la pertinence des missions :

- **Cache** : Les scores sémantiques sont mis en cache dans `chrome.storage.local` via `semantic-cache.ts`
- **TTL** : 7 jours (les scores sont moins volatiles que les données TJM)
- **Invalidation** : Le cache est vidé quand le profil utilisateur change
- **Limitation** : Seules les N premières missions d'un scan sont analysées (`maxSemanticPerScan` dans les settings)

Le scoring sémantique est optionnel et non-bloquant : si Gemini Nano n'est pas disponible, le scoring de base (`relevance.ts`) est utilisé.

## Conventions TypeScript

- `strict: true` dans tsconfig
- Pas de `any` — utiliser `unknown` + type guards si nécessaire
- Types dans `src/lib/core/types/` — un fichier par domaine
- Zod pour la validation des réponses LLM (parse + safeParse)
- Les types Chrome sont fournis par `@types/chrome`
- Chaque machine XState a ses types explicites dans `setup({ types: { ... } })`

## Conventions de test

- Unit tests avec Vitest pour le Core : scoring, déduplication, parsing connecteurs — **sans mocks**
- Les fonctions Core sont testables avec des données pures (injection de `now: Date`, etc.)
- Fichiers de test dans `tests/unit/` (miroir de `src/lib/core/`)
- Fixtures dans `tests/fixtures/` (HTML scrapé, jeux de missions)
- Tests d'intégration Shell avec mocks de `chrome.*` APIs (`vitest-chrome` ou mocks manuels)
- E2E avec Playwright pour les flows critiques : onboarding, scan + feed, settings

## Développement local

### Mode dev (sans extension Chrome)

```bash
pnpm dev
# Ouvrir http://localhost:5173/src/sidepanel/index.html
```

En mode dev, les APIs Chrome sont automatiquement stubées avec des données mock. L'UI est fonctionnelle sans charger l'extension.

### Dev Panel

`Ctrl+Shift+D` ouvre un panel de contrôle avec :
- **Feed State** : basculer entre empty / loading / loaded / error
- **Missions** : injecter N missions mock
- **Onboarding** : toggle l'état onboarding complété
- **Bridge Logs** : messages bridge en temps réel

### XState Inspector

En mode dev, `@statelyai/inspect` est activé automatiquement. Ouvrir https://stately.ai/inspect pour visualiser les machines XState en temps réel.

### Bridge Logging

Les messages bridge sont loggés automatiquement en mode dev :
```
[Bridge] → SCAN_START                    12:34:56.789
[Bridge] ← SCAN_STATUS {progress: 0.5}  12:34:57.123
[Bridge] ← MISSIONS_UPDATED [8 items]   12:34:58.456
```
Logs visibles dans la console ET dans le Dev Panel.

### Structure dev

```
src/dev/                    # Tree-shaken en production
├── index.ts                # Bootstrap dev mode
├── mocks.ts                # Données mock (profil, missions, TJM)
├── chrome-stubs.ts         # Stubs chrome.* APIs
├── DevPanel.svelte         # Drawer overlay (Ctrl+Shift+D)
└── bridge-logger.ts        # Intercepteur de messages bridge
```

Tout le code dans `src/dev/` est derrière `import.meta.env.DEV` et n'est jamais inclus dans le build production.

## Conventions Git

- Conventional commits : `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Scope par domaine : `feat(connector): add Malt scraper`, `fix(tjm): cache invalidation`
- Branche principale : `main`
- Feature branches : `feat/nom-feature`
- PR obligatoire pour merge dans `main`

## Ce qu'il ne faut JAMAIS faire

1. **Mélanger Svelte 4 et 5** — Ce projet est 100% Svelte 5 runes
2. **Utiliser des stores Svelte** — Tout état partagé passe par XState
3. **Accéder à chrome.* depuis le side panel** — Passer par le messaging bridge
4. **Stocker des credentials** — On utilise les sessions navigateur existantes
5. **Créer un backend** — L'architecture est local-first
6. **Utiliser tailwind.config.js** — TailwindCSS 4 = CSS-first avec @theme
7. **Mettre de la logique métier dans les composants UI** — Déléguer à `lib/core/` ou aux machines
8. **Ignorer les erreurs de connecteur** — Chaque erreur doit être typée et remonter proprement
9. **Appeler Gemini Nano sans passer par le cache** — Coût et latence inutiles
10. **Commit du code avec `any`** — TypeScript strict, pas de compromis
11. **Importer du Shell depuis le Core** — `core/` ne doit JAMAIS importer depuis `shell/`
12. **Utiliser `Date.now()` ou `new Date()` dans le Core** — Injecter via paramètre depuis le Shell
13. **Mettre de l'I/O dans le Core** — Pas de `fetch`, `indexedDB`, `chrome.*` dans `core/`
