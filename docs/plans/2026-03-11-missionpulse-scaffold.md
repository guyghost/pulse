# MissionPulse — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the complete MissionPulse Chrome extension skeleton — a freelance mission aggregator with scoring and TJM analysis.

**Architecture:** Chrome MV3 extension with 3 execution contexts (Service Worker, Offscreen Document, Side Panel). State managed by XState 5 actors, UI in Svelte 5 runes, styled with TailwindCSS 4 CSS-first config. Local-first with optional Anthropic API call for TJM intelligence.

**Tech Stack:** Svelte 5, TailwindCSS 4, XState 5, TypeScript strict, Vite + @crxjs/vite-plugin, Vitest, Playwright

**Skills:** @xstate for XState 5 machines, @web for UI components, @architecture for FC&IS patterns

---

## Task 1: Project Initialization

**Files:**
- Create: `missionpulse/package.json`
- Create: `missionpulse/tsconfig.json`
- Create: `missionpulse/vite.config.ts`
- Create: `missionpulse/README.md`

**Step 1: Create project directory and package.json**

```bash
mkdir -p missionpulse && cd missionpulse
```

```json
{
  "name": "missionpulse",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "svelte": "^5.0.0",
    "xstate": "^5.0.0",
    "@xstate/svelte": "^3.0.0",
    "lucide-svelte": "^0.460.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@types/chrome": "^0.0.287",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "@playwright/test": "^1.49.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vitest/globals"],
    "paths": {
      "$lib/*": ["./src/lib/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import manifest from './src/manifest.json';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '$lib': resolve(__dirname, './src/lib'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
      },
    },
  },
});
```

**Step 4: Create README.md**

Short README with project name, description, and npm scripts.

**Step 5: Install dependencies**

```bash
cd missionpulse && npm install
```

**Step 6: Commit**

```bash
git init && git add -A && git commit -m "chore: initialize project with Vite, Svelte 5, TailwindCSS 4, XState 5"
```

---

## Task 2: Chrome Manifest & Entry Points

**Files:**
- Create: `missionpulse/src/manifest.json`
- Create: `missionpulse/src/background/index.ts`
- Create: `missionpulse/src/offscreen/index.html`
- Create: `missionpulse/src/offscreen/index.ts`
- Create: `missionpulse/src/sidepanel/index.html`
- Create: `missionpulse/src/sidepanel/main.ts`
- Create: `missionpulse/src/sidepanel/App.svelte`
- Create: `missionpulse/static/icons/icon-16.png` (placeholder)
- Create: `missionpulse/static/icons/icon-48.png` (placeholder)
- Create: `missionpulse/static/icons/icon-128.png` (placeholder)

**Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "MissionPulse",
  "version": "0.1.0",
  "description": "Agent freelance : feed de missions centralisé avec scoring et analyse TJM",
  "permissions": ["sidePanel", "storage", "cookies", "alarms", "notifications", "offscreen"],
  "host_permissions": [
    "https://www.free-work.com/*",
    "https://www.malt.fr/*",
    "https://app.comet.co/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "action": {
    "default_title": "MissionPulse"
  },
  "icons": {
    "16": "static/icons/icon-16.png",
    "48": "static/icons/icon-48.png",
    "128": "static/icons/icon-128.png"
  }
}
```

**Step 2: Create background/index.ts**

Service worker entry — imports machines, sets up alarm listener, opens side panel on action click.

**Step 3: Create offscreen/index.html + index.ts**

Minimal HTML page. TS listens for `chrome.runtime.onMessage` with type `SCRAPE_URL`, fetches the URL, parses DOM, sends back `SCRAPE_RESULT`.

**Step 4: Create sidepanel/index.html + main.ts + App.svelte**

HTML imports the design tokens CSS and mounts Svelte. `main.ts` mounts `App.svelte` on `#app`. `App.svelte` is a minimal shell with router state (feed/tjm/settings/onboarding).

**Step 5: Create placeholder icon PNGs**

Generate minimal 16x16, 48x48, 128x128 PNG placeholders.

**Step 6: Verify build compiles**

```bash
npm run build
```

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add Chrome MV3 manifest, service worker, offscreen, and side panel entries"
```

---

## Task 3: TypeScript Types

**Files:**
- Create: `src/lib/types/mission.ts`
- Create: `src/lib/types/connector.ts`
- Create: `src/lib/types/profile.ts`
- Create: `src/lib/types/tjm.ts`

**Step 1: Create mission.ts**

```typescript
export type MissionSource = 'free-work' | 'malt' | 'comet';

export interface Mission {
  id: string;
  title: string;
  client: string | null;
  description: string;
  stack: string[];
  tjm: number | null;
  location: string | null;
  remote: 'full' | 'hybrid' | 'onsite' | null;
  duration: string | null;
  url: string;
  source: MissionSource;
  scrapedAt: Date;
  score: number | null;
}
```

**Step 2: Create connector.ts**

```typescript
import type { Mission } from './mission';

export interface PlatformConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;

  detectSession(): Promise<boolean>;
  fetchMissions(): Promise<Mission[]>;
  getLastSync(): Promise<Date | null>;
}

export interface ConnectorError {
  connectorId: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

export type ConnectorStatus = 'detecting' | 'authenticated' | 'expired' | 'fetching' | 'done' | 'error';
```

**Step 3: Create profile.ts**

```typescript
import type { SeniorityLevel } from './tjm';

export interface UserProfile {
  stack: string[];
  tjmMin: number;
  tjmMax: number;
  location: string;
  remote: 'full' | 'hybrid' | 'onsite' | 'any';
  seniority: SeniorityLevel;
  title: string;
}
```

**Step 4: Create tjm.ts**

```typescript
export type SeniorityLevel = 'junior' | 'confirmed' | 'senior';

export type TJMTrend = 'up' | 'stable' | 'down';

export interface TJMRange {
  min: number;
  median: number;
  max: number;
}

export interface TJMAnalysis {
  junior: TJMRange;
  confirmed: TJMRange;
  senior: TJMRange;
  trend: TJMTrend;
  trendDetail: string;
  recommendation: string;
  confidence: number;
  dataPoints: number;
  analyzedAt: Date;
}

export interface TJMDataPoint {
  tjm: number;
  title: string;
  location: string | null;
  source: string;
  date: Date;
}
```

**Step 5: Verify types compile**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add TypeScript types for missions, connectors, profile, and TJM"
```

---

## Task 4: Storage Layer

**Files:**
- Create: `src/lib/storage/db.ts`
- Create: `src/lib/storage/chrome-storage.ts`

**Step 1: Create db.ts — IndexedDB wrapper**

IndexedDB wrapper with stores for missions, TJM history, and user profile. Methods: `saveMissions()`, `getMissions()`, `saveTJMDataPoint()`, `getTJMDataPoints()`, `saveProfile()`, `getProfile()`. Use raw IndexedDB (no library) with promise wrappers.

**Step 2: Create chrome-storage.ts — chrome.storage.local wrapper**

Typed wrapper for settings and API key. Methods: `getApiKey()`, `setApiKey()`, `getSettings()`, `setSettings()`. Settings type: `{ scanIntervalMinutes: number; enabledConnectors: string[]; notifications: boolean }`.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add storage layer (IndexedDB + chrome.storage wrappers)"
```

---

## Task 5: Messaging Bridge

**Files:**
- Create: `src/lib/messaging/bridge.ts`

**Step 1: Create bridge.ts**

Define `BridgeMessage` discriminated union type covering all message types from AGENTS.md. Helper functions: `sendMessage<T>()`, `onMessage()` with typed handler. This is the single communication layer between all 3 Chrome contexts.

```typescript
export type BridgeMessage =
  | { type: 'SCAN_START' }
  | { type: 'SCAN_STATUS'; payload: ScanSnapshot }
  | { type: 'MISSIONS_UPDATED'; payload: Mission[] }
  | { type: 'SCRAPE_URL'; payload: { url: string; connectorId: string } }
  | { type: 'SCRAPE_RESULT'; payload: { missions: Mission[] } }
  | { type: 'TJM_REQUEST'; payload: TJMQuery }
  | { type: 'TJM_RESULT'; payload: TJMAnalysis }
  | { type: 'GET_PROFILE' }
  | { type: 'PROFILE_RESULT'; payload: UserProfile | null }
  | { type: 'SAVE_PROFILE'; payload: UserProfile };

export type ScanSnapshot = {
  state: string;
  currentConnector: string | null;
  progress: number;
  missionsFound: number;
};

export type TJMQuery = {
  title: string;
  location: string;
  seniority: SeniorityLevel;
};
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add typed messaging bridge for inter-context communication"
```

---

## Task 6: Connectors

**Files:**
- Create: `src/lib/connectors/base.connector.ts`
- Create: `src/lib/connectors/freework.connector.ts`
- Create: `src/lib/connectors/malt.connector.ts`
- Create: `src/lib/connectors/index.ts`
- Create: `tests/unit/connectors/freework.test.ts`

**Step 1: Write freework.test.ts**

Test the HTML parsing logic of the Free-Work connector. Create a fixture with sample HTML from the Free-Work missions page. Test that `parseMissionsFromHTML(html)` returns correctly typed `Mission[]`.

```typescript
import { describe, it, expect } from 'vitest';
import { parseFreeWorkHTML } from '$lib/connectors/freework.connector';

const FIXTURE_HTML = `<!-- realistic Free-Work job listing HTML -->`;

describe('Free-Work Connector', () => {
  it('parses mission cards from HTML', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML);
    expect(missions.length).toBeGreaterThan(0);
    expect(missions[0]).toMatchObject({
      source: 'free-work',
      title: expect.any(String),
      url: expect.stringContaining('free-work.com'),
    });
  });

  it('extracts stack tags', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML);
    expect(missions[0].stack.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty HTML', () => {
    expect(parseFreeWorkHTML('')).toEqual([]);
  });
});
```

**Step 2: Run test — verify it fails**

```bash
npx vitest run tests/unit/connectors/freework.test.ts
```

**Step 3: Create base.connector.ts**

Abstract base class implementing `PlatformConnector` with shared logic for session detection via `chrome.cookies`.

**Step 4: Create freework.connector.ts**

Implement `FreeWorkConnector extends BaseConnector`. Export `parseFreeWorkHTML()` for testability. The connector uses the messaging bridge to request scraping via offscreen document.

**Step 5: Run test — verify it passes**

```bash
npx vitest run tests/unit/connectors/freework.test.ts
```

**Step 6: Create malt.connector.ts (stub)**

Stub returning `[]` with `// TODO: implement Malt scraping`.

**Step 7: Create connectors/index.ts — registry**

```typescript
import { FreeWorkConnector } from './freework.connector';
import { MaltConnector } from './malt.connector';
import type { PlatformConnector } from '$lib/types/connector';

export const connectorRegistry: PlatformConnector[] = [
  new FreeWorkConnector(),
  new MaltConnector(),
];

export function getConnector(id: string): PlatformConnector | undefined {
  return connectorRegistry.find(c => c.id === id);
}
```

**Step 8: Commit**

```bash
git add -A && git commit -m "feat(connectors): add Free-Work connector with HTML parser and Malt stub"
```

---

## Task 7: Scoring & Deduplication

**Files:**
- Create: `src/lib/scoring/relevance.ts`
- Create: `src/lib/scoring/dedup.ts`
- Create: `tests/unit/scoring/relevance.test.ts`

**Step 1: Write relevance.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { scoreMission } from '$lib/scoring/relevance';
import type { Mission } from '$lib/types/mission';
import type { UserProfile } from '$lib/types/profile';

const profile: UserProfile = {
  stack: ['TypeScript', 'React', 'Node.js'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  title: 'Développeur Fullstack',
};

describe('scoreMission', () => {
  it('scores high for perfect stack match + TJM in range + location match', () => {
    const mission: Mission = {
      id: '1', title: 'Dev React/TypeScript', client: null,
      description: 'Mission React TypeScript Node.js',
      stack: ['React', 'TypeScript', 'Node.js'],
      tjm: 600, location: 'Paris', remote: 'hybrid',
      duration: '6 mois', url: 'https://example.com',
      source: 'free-work', scrapedAt: new Date(), score: null,
    };
    const score = scoreMission(mission, profile);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('scores low for no stack match', () => {
    const mission: Mission = {
      id: '2', title: 'Dev Java', client: null,
      description: 'Mission Java Spring',
      stack: ['Java', 'Spring'],
      tjm: 600, location: 'Paris', remote: 'hybrid',
      duration: '3 mois', url: 'https://example.com',
      source: 'free-work', scrapedAt: new Date(), score: null,
    };
    const score = scoreMission(mission, profile);
    expect(score).toBeLessThan(50);
  });

  it('returns score between 0 and 100', () => {
    const mission: Mission = {
      id: '3', title: 'Test', client: null, description: '',
      stack: [], tjm: null, location: null, remote: null,
      duration: null, url: '', source: 'free-work',
      scrapedAt: new Date(), score: null,
    };
    const score = scoreMission(mission, profile);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
```

**Step 2: Run test — verify fail**

**Step 3: Implement relevance.ts**

Scoring with weights: stack match 40%, location 20%, TJM range 25%, remote preference 15%. Case-insensitive stack matching. Returns 0-100.

**Step 4: Run test — verify pass**

**Step 5: Create dedup.ts**

Jaccard similarity on title + stack. If similarity > 0.8, consider duplicate. Keep the one with more data (TJM present, longer description). Export `deduplicateMissions(missions: Mission[]): Mission[]`.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(scoring): add relevance scoring with weighted criteria and Jaccard dedup"
```

---

## Task 8: TJM Intelligence Pipeline

**Files:**
- Create: `src/lib/tjm/aggregator.ts`
- Create: `src/lib/tjm/llm-analyzer.ts`
- Create: `src/lib/tjm/cache.ts`
- Create: `tests/unit/tjm/aggregator.test.ts`

**Step 1: Write aggregator.test.ts**

Test that `aggregateTJMData()` groups by title+location, computes min/median/max/stddev correctly. Use fixture data with known expected outputs.

**Step 2: Run test — verify fail**

**Step 3: Implement aggregator.ts**

Query IndexedDB for TJM data points from last 30 days. Group by normalized title + location. Compute statistics per group.

**Step 4: Run test — verify pass**

**Step 5: Implement cache.ts**

Cache with 24h TTL. Key = hash of (title + location + seniority). Store in IndexedDB. Methods: `getCachedAnalysis()`, `cacheAnalysis()`, `isCacheValid()`.

**Step 6: Implement llm-analyzer.ts**

Call Anthropic API with aggregated data. Use the exact prompt from PROMPT_BOOTSTRAP.md. Parse JSON response. Validate with type guard. Include `anthropic-dangerous-direct-browser-access` header.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat(tjm): add aggregator, LLM analyzer, and 24h cache layer"
```

---

## Task 9: XState Machines — Background

**Files:**
- Create: `src/background/machines/scan.machine.ts`
- Create: `src/background/machines/connector.machine.ts`

**Step 1: Create scan.machine.ts**

States: `idle` → `preparing` → `scanning` → `deduplicating` → `scoring` → `complete`.
Context: `{ connectors: string[]; currentIndex: number; missions: Mission[]; errors: ConnectorError[] }`.
Events: `START_SCAN`, `CONNECTOR_DONE`, `CONNECTOR_ERROR`, `SCAN_COMPLETE`.
Use `setup()` API with typed actors for each connector invocation.

**Step 2: Create connector.machine.ts**

States: `detecting` → `authenticated` / `expired` → `fetching` → `done` / `error`.
Context: `{ connectorId: string; missions: Mission[]; error: ConnectorError | null; lastSync: Date | null }`.
Events: `DETECT`, `SESSION_VALID`, `SESSION_EXPIRED`, `FETCH`, `FETCH_DONE`, `FETCH_ERROR`.

**Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(machines): add scan and connector XState 5 machines"
```

---

## Task 10: XState Machines — Side Panel

**Files:**
- Create: `src/machines/feed.machine.ts`
- Create: `src/machines/onboarding.machine.ts`
- Create: `src/machines/tjm.machine.ts`
- Create: `src/machines/filters.machine.ts`

**Step 1: Create feed.machine.ts**

States: `empty` → `loading` → `loaded` → `filtered` / `searching` → `error`.
Context: `{ missions: Mission[]; filteredMissions: Mission[]; searchQuery: string; error: string | null }`.

**Step 2: Create onboarding.machine.ts**

States: `welcome` → `profile` → `connectors` → `firstScan` → `done`.
Context: `{ profile: Partial<UserProfile>; enabledConnectors: string[]; scanComplete: boolean }`.

**Step 3: Create tjm.machine.ts**

States: `idle` → `aggregating` → `callingLLM` → `analyzing` → `ready` / `error`.
Context: `{ query: TJMQuery | null; aggregatedData: TJMDataPoint[]; analysis: TJMAnalysis | null; error: string | null }`.

**Step 4: Create filters.machine.ts**

States: `inactive` → `active`.
Context: `{ stack: string[]; tjmRange: { min: number; max: number } | null; location: string | null; remote: 'full' | 'hybrid' | 'onsite' | null }`.

**Step 5: Verify types compile**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(machines): add feed, onboarding, TJM, and filters XState 5 machines"
```

---

## Task 11: Design Tokens & Atoms

**Files:**
- Create: `src/ui/design-tokens.css`
- Create: `src/ui/atoms/Badge.svelte`
- Create: `src/ui/atoms/Button.svelte`
- Create: `src/ui/atoms/Icon.svelte`
- Create: `src/ui/atoms/Chip.svelte`
- Create: `src/ui/atoms/Skeleton.svelte`
- Create: `src/ui/atoms/Indicator.svelte`

**Step 1: Create design-tokens.css**

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

  --radius-lg: 0.5rem;
  --radius-full: 9999px;

  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3);
  --shadow-card-hover: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
}
```

**Step 2: Create all 6 atom components**

Each uses Svelte 5 `$props()`, `$derived`, TailwindCSS classes. No XState. No business logic.

- **Badge.svelte**: `{ label, variant: 'tech' | 'status' | 'source' }` — mono font for tech, colored backgrounds
- **Button.svelte**: `{ variant: 'primary' | 'secondary' | 'ghost', onclick, disabled, children }` — snippet for children
- **Icon.svelte**: `{ name, size = 16, class: className }` — wraps lucide-svelte icons
- **Chip.svelte**: `{ label, selected, onclick }` — toggleable filter chip
- **Skeleton.svelte**: `{ width, height, rounded }` — animated loading placeholder
- **Indicator.svelte**: `{ status: 'online' | 'offline' | 'error' }` — colored dot

**Step 3: Verify build compiles**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): add design tokens and atomic components (Badge, Button, Icon, Chip, Skeleton, Indicator)"
```

---

## Task 12: Molecules

**Files:**
- Create: `src/ui/molecules/MissionCard.svelte`
- Create: `src/ui/molecules/TJMGauge.svelte`
- Create: `src/ui/molecules/ConnectorStatus.svelte`
- Create: `src/ui/molecules/FilterBar.svelte`
- Create: `src/ui/molecules/SearchInput.svelte`
- Create: `src/ui/molecules/TrendBadge.svelte`

**Step 1: Create all 6 molecule components**

Each receives data via `$props()` — no XState access, no direct service calls.

- **MissionCard.svelte**: `{ mission: Mission }` — card with colored left border based on score, title, stack badges, TJM, location, source badge. Expandable description. `transition:slide`.
- **TJMGauge.svelte**: `{ missionTjm: number, range: TJMRange }` — horizontal bar showing market range with mission TJM marker. Color: green if within, amber if below, red if above.
- **ConnectorStatus.svelte**: `{ name, status: ConnectorStatus, lastSync: Date | null }` — row with indicator dot, name, status text, relative time since last sync.
- **FilterBar.svelte**: `{ filters, onFilterChange }` — horizontal bar with Chip components for stack, TJM range, location, remote mode.
- **SearchInput.svelte**: `{ value, onSearch }` — input with debounce (300ms), search icon, clear button.
- **TrendBadge.svelte**: `{ trend: TJMTrend }` — arrow icon + label (hausse/stable/baisse), colored accordingly.

**Step 2: Verify build**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): add molecule components (MissionCard, TJMGauge, FilterBar, SearchInput, ConnectorStatus, TrendBadge)"
```

---

## Task 13: Organisms

**Files:**
- Create: `src/ui/organisms/MissionFeed.svelte`
- Create: `src/ui/organisms/TJMDashboard.svelte`
- Create: `src/ui/organisms/ConnectorPanel.svelte`
- Create: `src/ui/organisms/OnboardingWizard.svelte`
- Create: `src/ui/organisms/ScanProgress.svelte`

**Step 1: Create all 5 organism components**

Organisms CAN use `useActor` from `@xstate/svelte` and interact with XState machines.

- **MissionFeed.svelte**: Scrollable list of MissionCard. Uses feed machine snapshot. Shows empty state, loading skeleton, error state. `{#each}` with `transition:fade` on items. Sorted by score descending.
- **TJMDashboard.svelte**: Uses TJM machine. Shows TJM ranges per seniority level, trend badge, recommendation text, confidence indicator. Triggers analysis on mount if stale.
- **ConnectorPanel.svelte**: Lists connectors with ConnectorStatus. Toggle enable/disable. Manual scan trigger button per connector.
- **OnboardingWizard.svelte**: Multi-step form driven by onboarding machine. Step 1: profile (title, stack, seniority). Step 2: TJM range + location + remote. Step 3: enable connectors. Step 4: first scan with progress.
- **ScanProgress.svelte**: Progress bar showing current scan state. Connector name being scanned, missions found count, animated progress indicator.

**Step 2: Verify build**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): add organism components (MissionFeed, TJMDashboard, ConnectorPanel, OnboardingWizard, ScanProgress)"
```

---

## Task 14: Templates & Pages

**Files:**
- Create: `src/ui/templates/FeedLayout.svelte`
- Create: `src/ui/templates/SettingsLayout.svelte`
- Create: `src/ui/templates/OnboardingLayout.svelte`
- Create: `src/ui/pages/FeedPage.svelte`
- Create: `src/ui/pages/TJMPage.svelte`
- Create: `src/ui/pages/SettingsPage.svelte`
- Create: `src/ui/pages/OnboardingPage.svelte`

**Step 1: Create 3 templates**

Templates are pure layout — no XState, no logic. They receive children/snippets and arrange them.

- **FeedLayout.svelte**: 400px wide. Header with nav tabs + scan button. Main area with FilterBar slot + MissionFeed slot. Optional TJM sidebar.
- **SettingsLayout.svelte**: Header with back nav. Scrollable content area with sections.
- **OnboardingLayout.svelte**: Centered card layout with step indicator, content area, nav buttons.

**Step 2: Create 4 pages**

Pages create actors, wire machines to organisms.

- **FeedPage.svelte**: Creates feed + filters actors. Passes snapshots to FeedLayout + MissionFeed + FilterBar. Shows ScanProgress when scanning.
- **TJMPage.svelte**: Creates TJM actor. Passes to TJMDashboard. Title input for query.
- **SettingsPage.svelte**: API key input (stored in chrome.storage), ConnectorPanel, profile editor.
- **OnboardingPage.svelte**: Creates onboarding actor. Passes to OnboardingWizard inside OnboardingLayout.

**Step 3: Wire App.svelte routing**

Update `App.svelte` with simple state-based routing: check if profile exists → if not, show OnboardingPage. Otherwise show FeedPage with nav tabs for TJM and Settings.

**Step 4: Verify build**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): add templates, pages, and App routing"
```

---

## Task 15: Background Service Worker Wiring

**Files:**
- Modify: `src/background/index.ts`

**Step 1: Wire service worker**

Complete the service worker entry:
- Create scan and connector machine actors
- Listen for messages via bridge
- Handle `SCAN_START` → start scan machine
- Handle `SCRAPE_RESULT` → forward to active connector machine
- Handle `TJM_REQUEST` → run TJM pipeline (aggregate → cache check → LLM)
- Handle `GET_PROFILE` → read from IndexedDB
- Handle `SAVE_PROFILE` → write to IndexedDB
- Set up `chrome.alarms` for periodic scan (interval from settings)
- Open side panel on action click: `chrome.sidePanel.open()`
- Broadcast `MISSIONS_UPDATED` after scan complete

**Step 2: Verify build**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(background): wire service worker with XState actors and message handling"
```

---

## Task 16: E2E Test Setup

**Files:**
- Create: `tests/e2e/feed.test.ts`
- Create: `playwright.config.ts`
- Create: `vitest.config.ts`

**Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '$lib': resolve(__dirname, './src/lib'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
  },
});
```

**Step 2: Create playwright.config.ts**

Basic Playwright config for Chrome extension testing.

**Step 3: Create feed.test.ts (stub)**

Stub E2E test with `// TODO: implement once extension can be loaded in test browser`.

**Step 4: Run unit tests**

```bash
npx vitest run
```

All unit tests (scoring, connector, aggregator) should pass.

**Step 5: Commit**

```bash
git add -A && git commit -m "test: add Vitest and Playwright configs, verify all unit tests pass"
```

---

## Task 17: Final Verification

**Step 1: npm install from clean state**

```bash
rm -rf node_modules && npm install
```

**Step 2: npm run build**

Verify `dist/` folder is created with loadable extension.

**Step 3: npm run test**

All unit tests pass.

**Step 4: Final commit**

```bash
git add -A && git commit -m "chore: final scaffold verification — build and tests pass"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Project init | 4 |
| 2 | Manifest & entries | 10 |
| 3 | TypeScript types | 4 |
| 4 | Storage layer | 2 |
| 5 | Messaging bridge | 1 |
| 6 | Connectors | 5 |
| 7 | Scoring & dedup | 3 |
| 8 | TJM pipeline | 4 |
| 9 | XState background | 2 |
| 10 | XState side panel | 4 |
| 11 | Design tokens & atoms | 7 |
| 12 | Molecules | 6 |
| 13 | Organisms | 5 |
| 14 | Templates & pages | 7 |
| 15 | SW wiring | 1 |
| 16 | Test setup | 3 |
| 17 | Final verification | 0 |
| **Total** | | **~68 files** |
