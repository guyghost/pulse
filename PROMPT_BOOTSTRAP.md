# MissionPulse — Prompt de création projet (Claude Code)

## Contexte

Tu vas créer le squelette complet d'une extension Chrome appelée **MissionPulse**. C'est un agent qui scrappe les plateformes freelance où l'utilisateur est connecté et remonte les missions dans un feed centralisé avec scoring de pertinence et analyse TJM par LLM.

## Stack technique

- **Extension** : Chrome Manifest V3 (service worker + offscreen documents + side panel)
- **UI** : Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`) — PAS de syntaxe Svelte 4 (`export let`, `$:`, stores)
- **Styling** : TailwindCSS 4 (CSS-first config via `@theme` dans un fichier CSS, PAS `tailwind.config.js`)
- **State management** : XState 5 (actors, `createMachine`, `setup()` API) — PAS XState 4 (`createMachine` avec `services`/`actions` en config objet)
- **Language** : TypeScript strict (`strict: true`, pas de `any`)
- **Build** : Vite + `@crxjs/vite-plugin` pour le build extension Chrome
- **Design system** : Atomic Design (atoms → molecules → organisms → templates → pages)
- **Tests** : Vitest pour les units, Playwright pour l'e2e

## Structure de fichiers à créer

```
missionpulse/
├── AGENTS.md                          # Instructions pour les agents IA
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── manifest.json                  # Chrome Manifest V3
│   ├── background/
│   │   ├── index.ts                   # Service worker entry
│   │   └── machines/
│   │       ├── scan.machine.ts        # Machine XState : cycle de scan
│   │       └── connector.machine.ts   # Machine XState : lifecycle d'un connecteur
│   ├── offscreen/
│   │   ├── index.html                 # Offscreen document pour DOM access
│   │   └── index.ts
│   ├── sidepanel/
│   │   ├── index.html                 # Side panel entry
│   │   ├── main.ts                    # Svelte mount
│   │   └── App.svelte
│   ├── lib/
│   │   ├── types/
│   │   │   ├── mission.ts             # Type Mission, MissionSource, TJMData
│   │   │   ├── connector.ts           # Interface PlatformConnector
│   │   │   ├── profile.ts             # Type UserProfile (stack, TJM, zone, seniority)
│   │   │   └── tjm.ts                 # Types TJMAnalysis, TJMTrend, SeniorityLevel
│   │   ├── connectors/
│   │   │   ├── base.connector.ts      # Classe abstraite BaseConnector
│   │   │   ├── freework.connector.ts  # Connecteur Free-Work
│   │   │   ├── malt.connector.ts      # Connecteur Malt (stub)
│   │   │   └── index.ts              # Registry des connecteurs
│   │   ├── scoring/
│   │   │   ├── relevance.ts           # Scoring keyword + TF-IDF
│   │   │   └── dedup.ts              # Déduplication Jaccard
│   │   ├── tjm/
│   │   │   ├── aggregator.ts          # Agrégation locale des TJM depuis IndexedDB
│   │   │   ├── llm-analyzer.ts        # Appel API Anthropic pour analyse TJM
│   │   │   └── cache.ts              # Cache 24h des analyses
│   │   ├── storage/
│   │   │   ├── db.ts                  # IndexedDB wrapper (missions, TJM history, profile)
│   │   │   └── chrome-storage.ts      # chrome.storage.local wrapper (settings, API key)
│   │   └── messaging/
│   │       └── bridge.ts             # chrome.runtime messaging entre contextes
│   ├── ui/
│   │   ├── design-tokens.css          # @theme TailwindCSS 4 : couleurs, spacing, typography
│   │   ├── atoms/
│   │   │   ├── Badge.svelte           # Badge techno, statut
│   │   │   ├── Button.svelte          # Bouton primaire/secondaire/ghost
│   │   │   ├── Icon.svelte            # Wrapper lucide-icons
│   │   │   ├── Chip.svelte            # Filtre sélectionnable
│   │   │   ├── Skeleton.svelte        # Loading placeholder
│   │   │   └── Indicator.svelte       # Dot coloré (connecteur on/off)
│   │   ├── molecules/
│   │   │   ├── MissionCard.svelte     # Carte mission : titre, stack, TJM, score, source
│   │   │   ├── TJMGauge.svelte        # Jauge visuelle TJM vs marché (sous/dans/au-dessus)
│   │   │   ├── ConnectorStatus.svelte # Ligne connecteur : nom, statut, dernier sync
│   │   │   ├── FilterBar.svelte       # Barre de filtres (stack, TJM, remote, seniority)
│   │   │   ├── SearchInput.svelte     # Champ de recherche avec debounce
│   │   │   └── TrendBadge.svelte      # Badge tendance TJM (↑ hausse, → stable, ↓ baisse)
│   │   ├── organisms/
│   │   │   ├── MissionFeed.svelte     # Liste scrollable de MissionCard
│   │   │   ├── TJMDashboard.svelte    # Vue analyse TJM : fourchettes, graph tendance, reco
│   │   │   ├── ConnectorPanel.svelte  # Panneau de gestion des connecteurs
│   │   │   ├── OnboardingWizard.svelte # Wizard profil initial (3 étapes)
│   │   │   └── ScanProgress.svelte    # Barre de progression du scan en cours
│   │   ├── templates/
│   │   │   ├── FeedLayout.svelte      # Layout : FilterBar + MissionFeed + TJM sidebar
│   │   │   ├── SettingsLayout.svelte  # Layout : settings/connecteurs/profil
│   │   │   └── OnboardingLayout.svelte
│   │   └── pages/
│   │       ├── FeedPage.svelte        # Page feed (état par défaut)
│   │       ├── TJMPage.svelte         # Page TJM Intelligence dédiée
│   │       ├── SettingsPage.svelte    # Settings + connecteurs
│   │       └── OnboardingPage.svelte  # Premier lancement
│   └── machines/
│       ├── feed.machine.ts            # Machine XState : état du feed (loading, filtered, empty, error)
│       ├── onboarding.machine.ts      # Machine XState : wizard onboarding (step1 → step2 → step3 → done)
│       ├── tjm.machine.ts             # Machine XState : cycle analyse TJM (idle → aggregating → calling_llm → done)
│       └── filters.machine.ts         # Machine XState : état des filtres actifs
├── tests/
│   ├── unit/
│   │   ├── scoring/
│   │   │   └── relevance.test.ts
│   │   ├── connectors/
│   │   │   └── freework.test.ts
│   │   └── tjm/
│   │       └── aggregator.test.ts
│   └── e2e/
│       └── feed.test.ts
└── static/
    └── icons/
        ├── icon-16.png
        ├── icon-48.png
        └── icon-128.png
```

## Instructions de création

### 1. Initialisation

```bash
mkdir missionpulse && cd missionpulse
npm init -y
npm install svelte @sveltejs/vite-plugin-svelte xstate @xstate/svelte tailwindcss @tailwindcss/vite
npm install -D vite typescript @crxjs/vite-plugin@beta vitest playwright @types/chrome
```

### 2. Manifest V3

Le `manifest.json` doit déclarer :
- `"manifest_version": 3`
- `"permissions": ["sidePanel", "storage", "cookies", "alarms", "notifications", "offscreen"]`
- `"host_permissions": ["https://www.free-work.com/*", "https://www.malt.fr/*", "https://app.comet.co/*"]`
- `"background.service_worker"` pointant vers le build du service worker
- `"side_panel.default_path"` pointant vers le side panel HTML
- `"action.default_popup"` : pas de popup, on utilise le side panel

### 3. Design tokens (TailwindCSS 4)

Créer `src/ui/design-tokens.css` avec un `@theme` qui définit :
- Palette : dark navy (`#0F172A`), electric blue (`#3B82F6`), emerald (`#10B981`), amber warning (`#F59E0B`), red danger (`#EF4444`), surfaces grises claires
- Typography : Inter pour le texte, JetBrains Mono pour les badges techniques
- Spacing scale cohérente
- Border radius : `rounded-lg` par défaut, `rounded-full` pour les badges
- Shadows subtiles pour les cards
- Le design doit être dense mais lisible — c'est un side panel de 400px de large

### 4. Composants Svelte 5 — Conventions

Chaque composant utilise **exclusivement** la syntaxe Svelte 5 :

```svelte
<script lang="ts">
  // Props via $props()
  let { title, score, sources = [] }: {
    title: string;
    score: number;
    sources?: string[];
  } = $props();

  // État local via $state
  let expanded = $state(false);

  // Dérivé via $derived
  let scoreColor = $derived(
    score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-gray-400'
  );

  // Effets via $effect
  $effect(() => {
    console.log(`Score changed: ${score}`);
  });
</script>
```

**Interdictions Svelte 4 :**
- PAS de `export let` (utiliser `$props()`)
- PAS de `$:` reactive declarations (utiliser `$derived` ou `$effect`)
- PAS de `writable()` / `readable()` stores (utiliser `$state` ou XState)
- PAS de `on:click` (utiliser `onclick`)

### 5. XState 5 — Conventions

Utiliser l'API `setup()` de XState 5 :

```typescript
import { setup, assign } from 'xstate';

export const scanMachine = setup({
  types: {
    context: {} as {
      connectors: string[];
      currentIndex: number;
      missions: Mission[];
      errors: ConnectorError[];
    },
    events: {} as
      | { type: 'START_SCAN' }
      | { type: 'CONNECTOR_DONE'; missions: Mission[] }
      | { type: 'CONNECTOR_ERROR'; error: ConnectorError }
      | { type: 'SCAN_COMPLETE' },
  },
  actions: {
    appendMissions: assign({
      missions: ({ context, event }) => [
        ...context.missions,
        ...(event as any).missions,
      ],
    }),
  },
}).createMachine({
  id: 'scan',
  initial: 'idle',
  context: {
    connectors: [],
    currentIndex: 0,
    missions: [],
    errors: [],
  },
  states: {
    idle: {
      on: { START_SCAN: 'scanning' },
    },
    scanning: {
      // ...invoke connectors sequentially
    },
    complete: {
      type: 'final',
    },
  },
});
```

**Interdictions XState 4 :**
- PAS de `createMachine({ services: {...} })` (utiliser `setup().createMachine()`)
- PAS de `interpret()` (utiliser `createActor()`)
- PAS de string actions/guards dans la config sans `setup()`

### 6. Connecteur Free-Work (implémentation réelle)

Le premier connecteur fonctionnel cible Free-Work (`https://www.free-work.com/fr/tech-it/jobs`). Il doit :
- Vérifier la présence d'un cookie de session valide via `chrome.cookies`
- Naviguer vers la page des missions tech via un offscreen document
- Parser le DOM pour extraire : titre, client, stack, TJM (si affiché), localisation, durée, URL
- Retourner un tableau de `Mission[]` typé

Les connecteurs Malt et Comet sont des stubs qui retournent `[]` avec un `TODO`.

### 7. Scoring de pertinence

Implémenter un scoring simple dans `scoring/relevance.ts` :
- Match sur stack technique (poids 40%)
- Match sur localisation (poids 20%)
- Match sur TJM dans la fourchette du profil (poids 25%)
- Match sur remote/hybride/onsite (poids 15%)
- Retourner un score 0-100

### 8. TJM Intelligence

Implémenter `tjm/llm-analyzer.ts` avec un appel API Anthropic :

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `Tu es un analyste du marché freelance tech français. Tu reçois des données agrégées de TJM et tu produis une analyse structurée. Réponds UNIQUEMENT en JSON valide, sans markdown.`,
    messages: [{
      role: 'user',
      content: `Analyse l'évolution des taux journaliers moyens (TJM) pour "${poste}" dans la zone "${zone}" sur le dernier mois.

Données collectées localement (${dataPoints} missions) :
${JSON.stringify(aggregatedData)}

Retourne un JSON avec cette structure exacte :
{
  "junior": { "min": number, "median": number, "max": number },
  "confirmed": { "min": number, "median": number, "max": number },
  "senior": { "min": number, "median": number, "max": number },
  "trend": "up" | "stable" | "down",
  "trendDetail": "explication courte de la tendance",
  "recommendation": "conseil pour ajuster le tarif",
  "confidence": number entre 0 et 1,
  "dataPoints": number
}`
    }],
  }),
});
```

### 9. Design UI

Le side panel fait **400px de large**. Le design doit être :
- **Dense mais aéré** : pas de gaspillage d'espace vertical, mais du breathing room entre les éléments
- **Dark mode par défaut** (background `#0F172A`, surfaces `#1E293B`, texte `#F8FAFC`)
- **Accents colorés** pour les scores (vert = bon match, ambre = moyen, gris = faible)
- **Cards avec bordure gauche colorée** selon le score de pertinence
- **TJM Gauge** : barre horizontale avec la fourchette marché et un marqueur pour le TJM de la mission
- **Micro-animations** : transitions Svelte sur les cards (fade+slide), pulse sur les nouvelles missions
- **Typographie** : titres en semibold 14px, corps en regular 13px, badges en mono 11px
- **Icônes** : Lucide icons, taille 16px dans les composants

### 10. Machines XState à implémenter

Créer les 6 machines suivantes avec états, transitions, et types complets :

1. **scan.machine.ts** : `idle` → `preparing` → `scanning` (par connecteur) → `deduplicating` → `scoring` → `complete`
2. **connector.machine.ts** : `detecting` → `authenticated` / `expired` → `fetching` → `done` / `error`
3. **feed.machine.ts** : `empty` → `loading` → `loaded` → `filtered` / `searching` → `error`
4. **onboarding.machine.ts** : `welcome` → `profile` → `connectors` → `firstScan` → `done`
5. **tjm.machine.ts** : `idle` → `aggregating` → `callingLLM` → `analyzing` → `ready` / `error`
6. **filters.machine.ts** : `inactive` → `active` (avec contexte: stack[], tjmRange, location, remote)

### 11. Ce qu'il ne faut PAS faire

- Ne PAS créer de backend / serveur
- Ne PAS utiliser de syntaxe Svelte 4
- Ne PAS utiliser de stores Svelte (utiliser XState pour tout état partagé)
- Ne PAS hardcoder des données de test dans les composants (utiliser des fixtures dans `/tests`)
- Ne PAS utiliser `tailwind.config.js` (TailwindCSS 4 = config CSS-first)
- Ne PAS stocker la clé API en clair dans le code (chrome.storage.local uniquement)

## Livrable attendu

Un projet fonctionnel qu'on peut :
1. `npm install` sans erreur
2. `npm run dev` pour le dev avec HMR
3. `npm run build` pour produire un dossier `dist/` chargeable dans `chrome://extensions`
4. Charger dans Chrome, ouvrir le side panel, voir le wizard onboarding
5. Après onboarding, voir le feed (vide si pas connecté à Free-Work, avec un message clair)
6. Les machines XState doivent être fonctionnelles et loguées en dev (XState inspector si possible)
