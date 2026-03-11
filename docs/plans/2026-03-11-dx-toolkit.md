# DX Toolkit — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make MissionPulse developable in a regular browser with mock data, a dev control panel, XState inspector, and bridge logging — all tree-shaken in production.

**Architecture:** A `src/dev/` directory contains all dev-only code. At boot (`main.ts`), if `import.meta.env.DEV && !globalThis.chrome?.runtime?.id`, Chrome API stubs are injected on `globalThis.chrome` and mock data is served. A DevPanel drawer (Ctrl+Shift+D) allows state manipulation. `@statelyai/inspect` is activated for XState debugging.

**Tech Stack:** Svelte 5, XState 5, @statelyai/inspect, TailwindCSS 4

---

## Task 1: Mock data module

**Files:**
- Create: `src/dev/mocks.ts`

**Step 1: Create the mock data file**

```typescript
import type { Mission } from '$lib/core/types/mission';
import type { UserProfile } from '$lib/core/types/profile';
import type { TJMAnalysis } from '$lib/core/types/tjm';

export const mockProfile: UserProfile = {
  stack: ['TypeScript', 'React', 'Node.js', 'Svelte'],
  tjmMin: 500,
  tjmMax: 750,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  title: 'Développeur Fullstack',
};

const stacks = [
  ['React', 'TypeScript', 'Node.js'],
  ['Vue.js', 'TypeScript', 'Python'],
  ['Angular', 'Java', 'Spring Boot'],
  ['Svelte', 'Go', 'PostgreSQL'],
  ['React Native', 'TypeScript', 'Firebase'],
  ['Next.js', 'TypeScript', 'Prisma'],
  ['Python', 'Django', 'PostgreSQL'],
  ['Rust', 'WebAssembly', 'TypeScript'],
];

const titles = [
  'Développeur React Senior',
  'Lead Dev Vue.js',
  'Architecte Java/Spring',
  'Développeur Fullstack Svelte/Go',
  'Développeur Mobile React Native',
  'Développeur Next.js',
  'Développeur Python/Django',
  'Développeur Rust embarqué',
  'Tech Lead Frontend',
  'DevOps / SRE Senior',
];

const clients = ['Société Générale', 'BNP Paribas', 'AXA', 'Thales', 'Capgemini', 'Startup FinTech', 'Scale-up SaaS', null];
const locations = ['Paris', 'Lyon', 'Nantes', 'Bordeaux', 'Remote', 'Toulouse'];
const remotes = ['full', 'hybrid', 'onsite', null] as const;
const durations = ['3 mois', '6 mois', '12 mois', '18 mois', null];

export function generateMockMissions(count: number): Mission[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => ({
    id: `mock-${i}`,
    title: titles[i % titles.length],
    client: clients[i % clients.length],
    description: `Mission ${titles[i % titles.length]} pour un projet de transformation digitale. Stack moderne, équipe agile, CI/CD.`,
    stack: stacks[i % stacks.length],
    tjm: 400 + Math.floor(Math.random() * 400),
    location: locations[i % locations.length],
    remote: remotes[i % remotes.length],
    duration: durations[i % durations.length],
    url: `https://www.free-work.com/fr/tech-it/jobs/mock-${i}`,
    source: i % 3 === 0 ? 'malt' as const : 'free-work' as const,
    scrapedAt: now,
    score: Math.floor(Math.random() * 100),
  }));
}

export const mockMissions: Mission[] = generateMockMissions(10);

export const mockTJMAnalysis: TJMAnalysis = {
  junior: { min: 350, median: 450, max: 550 },
  confirmed: { min: 500, median: 600, max: 700 },
  senior: { min: 650, median: 750, max: 900 },
  trend: 'up',
  trendDetail: 'Hausse de 5% sur les profils React/TypeScript en Île-de-France',
  recommendation: 'Votre TJM est dans la fourchette haute. Maintenez votre positionnement.',
  confidence: 0.82,
  dataPoints: 47,
  analyzedAt: new Date(),
};
```

**Step 2: Verify it compiles**

```bash
pnpm build 2>&1 | tail -3
```

Expected: Build succeeds (dev files are included in build but tree-shaken if not imported from production code).

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(dev): add mock data module (missions, profile, TJM analysis)"
```

---

## Task 2: Chrome API stubs

**Files:**
- Create: `src/dev/chrome-stubs.ts`

**Step 1: Create the Chrome API stubs**

```typescript
import type { BridgeMessage } from '$lib/shell/messaging/bridge';
import { mockProfile, mockMissions } from './mocks';

const storage: Record<string, unknown> = {
  settings: {
    scanIntervalMinutes: 30,
    enabledConnectors: ['free-work'],
    notifications: true,
  },
};

function createChromeStubs() {
  const listeners: Array<(message: BridgeMessage, sender: unknown, sendResponse: (r: unknown) => void) => void> = [];

  return {
    runtime: {
      id: 'dev-mode',
      sendMessage: async (message: BridgeMessage): Promise<BridgeMessage | null> => {
        console.log('[Chrome Stub] sendMessage:', message.type);

        switch (message.type) {
          case 'GET_PROFILE':
            return { type: 'PROFILE_RESULT', payload: mockProfile };
          case 'SAVE_PROFILE':
            console.log('[Chrome Stub] Profile saved:', message.payload);
            return { type: 'PROFILE_RESULT', payload: message.payload };
          case 'SCAN_START':
            return { type: 'SCAN_STATUS', payload: { state: 'complete', currentConnector: null, progress: 1, missionsFound: mockMissions.length } };
          default:
            console.log('[Chrome Stub] Unhandled message type:', message.type);
            return null;
        }
      },
      onMessage: {
        addListener: (fn: (...args: unknown[]) => void) => {
          listeners.push(fn as typeof listeners[0]);
        },
        removeListener: (fn: (...args: unknown[]) => void) => {
          const idx = listeners.indexOf(fn as typeof listeners[0]);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      },
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          const result: Record<string, unknown> = {};
          for (const k of keyArr) {
            if (k in storage) result[k] = storage[k];
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(storage, items);
        },
        remove: async (keys: string | string[]) => {
          const keyArr = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyArr) delete storage[k];
        },
      },
    },
    cookies: {
      getAll: async () => [{ name: 'session', value: 'mock-session' }],
    },
    sidePanel: {
      setPanelBehavior: () => {},
    },
    alarms: {
      create: async () => {},
      onAlarm: {
        addListener: () => {},
      },
    },
  };
}

export function installChromeStubs(): void {
  if (!globalThis.chrome?.runtime?.id) {
    (globalThis as Record<string, unknown>).chrome = createChromeStubs();
    console.log('[Dev] Chrome API stubs installed');
  }
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(dev): add Chrome API stubs for browser-mode development"
```

---

## Task 3: Dev bootstrap & wire into main.ts

**Files:**
- Create: `src/dev/index.ts`
- Modify: `src/sidepanel/main.ts`

**Step 1: Create dev bootstrap**

```typescript
export const isDev = import.meta.env.DEV;

export const isExtensionContext = !!globalThis.chrome?.runtime?.id;

export async function bootstrapDevMode(): Promise<void> {
  if (!isDev) return;

  // Install Chrome stubs if not in extension context
  if (!isExtensionContext) {
    const { installChromeStubs } = await import('./chrome-stubs');
    installChromeStubs();
  }

  // Install bridge logger
  const { installBridgeLogger } = await import('./bridge-logger');
  installBridgeLogger();

  // Install XState inspector
  try {
    const { createBrowserInspector } = await import('@statelyai/inspect');
    createBrowserInspector({ autoStart: true });
    console.log('[Dev] XState inspector active — open https://stately.ai/inspect');
  } catch {
    console.log('[Dev] XState inspector not available (install @statelyai/inspect)');
  }

  console.log('[Dev] Dev mode active', { isExtensionContext });
}
```

**Step 2: Create bridge-logger placeholder (will be filled in Task 5)**

Create `src/dev/bridge-logger.ts`:

```typescript
export function installBridgeLogger(): void {
  console.log('[Dev] Bridge logger installed');
}
```

**Step 3: Wire into main.ts**

Modify `src/sidepanel/main.ts`:

```typescript
import '../ui/design-tokens.css';
import App from './App.svelte';
import { mount } from 'svelte';

async function init() {
  if (import.meta.env.DEV) {
    const { bootstrapDevMode } = await import('../dev/index');
    await bootstrapDevMode();
  }

  mount(App, {
    target: document.getElementById('app')!,
  });
}

init();
```

**Step 4: Install @statelyai/inspect as devDependency**

```bash
pnpm add -D @statelyai/inspect
```

**Step 5: Verify dev server works**

```bash
pnpm dev &
sleep 5
# The side panel should now show the onboarding wizard instead of a blank page
```

Open `http://localhost:5173/src/sidepanel/index.html` in a browser — should show the MissionPulse onboarding UI.

**Step 6: Verify tests still pass**

```bash
pnpm test
```

**Step 7: Commit**

```bash
git add -A && git commit -m "feat(dev): wire dev bootstrap into main.ts with Chrome stubs and XState inspector"
```

---

## Task 4: Dev Panel component

**Files:**
- Create: `src/dev/DevPanel.svelte`
- Modify: `src/sidepanel/App.svelte`

**Step 1: Create DevPanel.svelte**

```svelte
<script lang="ts">
  import { generateMockMissions } from './mocks';
  import Button from '../ui/atoms/Button.svelte';
  import Icon from '../ui/atoms/Icon.svelte';

  let { onInjectMissions, onSetState, onToggleOnboarding, logs = [] }: {
    onInjectMissions?: (count: number) => void;
    onSetState?: (state: 'empty' | 'loading' | 'loaded' | 'error') => void;
    onToggleOnboarding?: () => void;
    logs?: Array<{ direction: string; type: string; summary: string; time: string }>;
  } = $props();

  let isOpen = $state(false);
  let missionCount = $state(10);

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      isOpen = !isOpen;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="fixed bottom-0 left-0 right-0 z-50 max-h-[50vh] overflow-y-auto bg-navy-900 border-t-2 border-accent-blue shadow-lg">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-navy-800 sticky top-0">
      <span class="text-xs font-bold text-accent-blue font-mono">DEV PANEL</span>
      <button class="text-text-secondary hover:text-text-primary" onclick={() => isOpen = false}>
        <Icon name="x" size={14} />
      </button>
    </div>

    <div class="p-3 space-y-4">
      <!-- State switcher -->
      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Feed State</span>
        <div class="flex gap-1 mt-1">
          {#each ['empty', 'loading', 'loaded', 'error'] as state}
            <button
              class="px-2 py-1 text-[11px] font-mono rounded bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
              onclick={() => onSetState?.(state as 'empty' | 'loading' | 'loaded' | 'error')}
            >
              {state}
            </button>
          {/each}
        </div>
      </div>

      <!-- Mission injector -->
      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Missions</span>
        <div class="flex items-center gap-2 mt-1">
          <input
            type="range"
            min="0"
            max="50"
            bind:value={missionCount}
            class="flex-1 accent-accent-blue"
          />
          <span class="text-xs font-mono text-text-secondary w-6 text-right">{missionCount}</span>
          <button
            class="px-2 py-1 text-[11px] font-mono rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors"
            onclick={() => onInjectMissions?.(missionCount)}
          >
            inject
          </button>
        </div>
      </div>

      <!-- Onboarding toggle -->
      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Onboarding</span>
        <div class="mt-1">
          <button
            class="px-2 py-1 text-[11px] font-mono rounded bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            onclick={() => onToggleOnboarding?.()}
          >
            toggle onboarding
          </button>
        </div>
      </div>

      <!-- Bridge logs -->
      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Bridge Logs</span>
        <div class="mt-1 max-h-32 overflow-y-auto bg-surface rounded p-2 font-mono text-[10px] space-y-0.5">
          {#if logs.length === 0}
            <p class="text-text-muted">No messages yet</p>
          {:else}
            {#each logs as log}
              <div class="flex gap-2">
                <span class="text-text-muted">{log.time}</span>
                <span class={log.direction === '→' ? 'text-accent-blue' : 'text-accent-emerald'}>{log.direction}</span>
                <span class="text-text-primary">{log.type}</span>
                <span class="text-text-secondary truncate">{log.summary}</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Toggle hint -->
{#if !isOpen}
  <div class="fixed bottom-2 right-2 z-50">
    <button
      class="px-2 py-1 text-[9px] font-mono rounded bg-navy-800/80 text-text-muted hover:text-accent-blue transition-colors border border-navy-700/50"
      onclick={() => isOpen = true}
    >
      Ctrl+Shift+D
    </button>
  </div>
{/if}
```

**Step 2: Wire DevPanel into App.svelte**

Modify `src/sidepanel/App.svelte`. Add the DevPanel import and state management at the top of the `<script>` block, and add the component at the bottom of the template.

Add to imports:
```typescript
import { generateMockMissions } from '../dev/mocks';
```

Add a conditional import + state for the DevPanel:
```typescript
let DevPanel: typeof import('../dev/DevPanel.svelte').default | null = $state(null);
let bridgeLogs: Array<{ direction: string; type: string; summary: string; time: string }> = $state([]);

if (import.meta.env.DEV) {
  import('../dev/DevPanel.svelte').then(m => { DevPanel = m.default; });
}

function devInjectMissions(count: number) {
  const missions = generateMockMissions(count);
  // Dispatch to the current page — we'll use a custom event
  window.dispatchEvent(new CustomEvent('dev:missions', { detail: missions }));
}

function devSetState(state: 'empty' | 'loading' | 'loaded' | 'error') {
  window.dispatchEvent(new CustomEvent('dev:feed-state', { detail: state }));
}

function devToggleOnboarding() {
  hasCompletedOnboarding = !hasCompletedOnboarding;
  currentPage = hasCompletedOnboarding ? 'feed' : 'onboarding';
}
```

Add at the end of the template (before the closing `</div>`):
```svelte
{#if import.meta.env.DEV && DevPanel}
  <DevPanel
    onInjectMissions={devInjectMissions}
    onSetState={devSetState}
    onToggleOnboarding={devToggleOnboarding}
    logs={bridgeLogs}
  />
{/if}
```

**Step 3: Wire FeedPage to listen for dev events**

Add to `src/ui/pages/FeedPage.svelte`, inside the `<script>` block:

```typescript
// Dev mode: listen for injected missions and state changes
if (import.meta.env.DEV) {
  $effect(() => {
    function handleMissions(e: Event) {
      const missions = (e as CustomEvent).detail;
      feedActor.send({ type: 'MISSIONS_LOADED', missions });
    }
    function handleState(e: Event) {
      const state = (e as CustomEvent).detail as string;
      if (state === 'empty') {
        feedActor.send({ type: 'MISSIONS_LOADED', missions: [] });
      } else if (state === 'loading') {
        feedActor.send({ type: 'LOAD' });
      } else if (state === 'loaded') {
        const { generateMockMissions } = await_import_not_available;
        // We receive missions via the dev:missions event instead
        feedActor.send({ type: 'REFRESH' });
      } else if (state === 'error') {
        feedActor.send({ type: 'LOAD_ERROR', error: '[Dev] Simulated error' });
      }
    }
    window.addEventListener('dev:missions', handleMissions);
    window.addEventListener('dev:feed-state', handleState);
    return () => {
      window.removeEventListener('dev:missions', handleMissions);
      window.removeEventListener('dev:feed-state', handleState);
    };
  });
}
```

IMPORTANT: The above snippet has a placeholder issue. Here's the corrected version for FeedPage dev event listeners:

```typescript
if (import.meta.env.DEV) {
  $effect(() => {
    function handleMissions(e: Event) {
      const missions = (e as CustomEvent).detail;
      feedActor.send({ type: 'MISSIONS_LOADED', missions });
    }
    function handleState(e: Event) {
      const state = (e as CustomEvent).detail as string;
      if (state === 'empty') {
        feedActor.send({ type: 'MISSIONS_LOADED', missions: [] });
      } else if (state === 'loading') {
        feedActor.send({ type: 'LOAD' });
      } else if (state === 'error') {
        feedActor.send({ type: 'LOAD_ERROR', error: '[Dev] Simulated error' });
      }
    }
    window.addEventListener('dev:missions', handleMissions);
    window.addEventListener('dev:feed-state', handleState);
    return () => {
      window.removeEventListener('dev:missions', handleMissions);
      window.removeEventListener('dev:feed-state', handleState);
    };
  });
}
```

**Step 4: Verify dev server shows the onboarding + DevPanel hint**

Open `http://localhost:5173/src/sidepanel/index.html` — should see:
- Onboarding wizard with "MissionPulse" heading and step dots
- Small "Ctrl+Shift+D" button in bottom-right corner
- Pressing Ctrl+Shift+D opens the Dev Panel

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(dev): add DevPanel with state switcher, mission injector, and onboarding toggle"
```

---

## Task 5: Bridge logger

**Files:**
- Modify: `src/dev/bridge-logger.ts`
- Modify: `src/lib/shell/messaging/bridge.ts`

**Step 1: Implement bridge-logger.ts**

Replace the placeholder content:

```typescript
type LogEntry = {
  direction: string;
  type: string;
  summary: string;
  time: string;
};

const logs: LogEntry[] = [];
const maxLogs = 100;

function formatTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

function summarizePayload(payload: unknown): string {
  if (payload === undefined || payload === null) return '';
  if (Array.isArray(payload)) return `[${payload.length} items]`;
  if (typeof payload === 'object') {
    const keys = Object.keys(payload as object);
    if (keys.length <= 3) return JSON.stringify(payload);
    return `{${keys.slice(0, 3).join(', ')}...}`;
  }
  return String(payload);
}

export function logBridgeMessage(direction: '→' | '←', type: string, payload?: unknown): void {
  const entry: LogEntry = {
    direction,
    type,
    summary: summarizePayload(payload),
    time: formatTime(),
  };
  logs.push(entry);
  if (logs.length > maxLogs) logs.shift();

  console.log(`[Bridge] ${direction} ${type} ${entry.summary}  ${entry.time}`);

  // Dispatch to DevPanel
  window.dispatchEvent(new CustomEvent('dev:bridge-log', { detail: entry }));
}

export function installBridgeLogger(): void {
  console.log('[Dev] Bridge logger installed');
}

export function getBridgeLogs(): LogEntry[] {
  return logs;
}
```

**Step 2: Add logging hooks in bridge.ts**

Modify `src/lib/shell/messaging/bridge.ts`. Wrap `sendMessage` and `onMessage` to log in dev mode.

Add at the top of the file:
```typescript
function devLog(direction: '→' | '←', type: string, payload?: unknown): void {
  if (import.meta.env.DEV) {
    import('../../dev/bridge-logger').then(({ logBridgeMessage }) => {
      logBridgeMessage(direction, type, payload);
    }).catch(() => {});
  }
}
```

Modify `sendMessage`:
```typescript
export function sendMessage<T extends BridgeMessage>(
  message: T,
): Promise<BridgeMessage> {
  devLog('→', message.type, 'payload' in message ? message.payload : undefined);
  return chrome.runtime.sendMessage(message);
}
```

Modify `onMessage`:
```typescript
export function onMessage(
  handler: (
    message: BridgeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: BridgeMessage) => void,
  ) => boolean | void,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    devLog('←', message.type, 'payload' in message ? message.payload : undefined);
    return handler(message, sender, sendResponse);
  });
}
```

**Step 3: Wire bridge logs into App.svelte**

Add to `src/sidepanel/App.svelte` in the `<script>` block, after the dev imports:

```typescript
if (import.meta.env.DEV) {
  $effect(() => {
    function handleBridgeLog(e: Event) {
      const log = (e as CustomEvent).detail;
      bridgeLogs = [...bridgeLogs.slice(-99), log];
    }
    window.addEventListener('dev:bridge-log', handleBridgeLog);
    return () => window.removeEventListener('dev:bridge-log', handleBridgeLog);
  });
}
```

**Step 4: Verify bridge logs appear**

Open DevPanel (Ctrl+Shift+D), navigate through onboarding — should see `GET_PROFILE` and other messages in the Bridge Logs section.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(dev): add bridge logger with DevPanel integration"
```

---

## Task 6: Auto-inject mock missions on feed load

**Files:**
- Modify: `src/dev/chrome-stubs.ts`
- Modify: `src/sidepanel/App.svelte`

**Step 1: Enhance chrome stubs to dispatch MISSIONS_UPDATED on SCAN_START**

In `src/dev/chrome-stubs.ts`, update the `SCAN_START` handler to also dispatch missions after a simulated delay:

Replace the `SCAN_START` case:

```typescript
case 'SCAN_START':
  // Simulate scan with delay
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('dev:missions', {
      detail: mockMissions.map(m => ({ ...m, scrapedAt: new Date() })),
    }));
  }, 800);
  return { type: 'SCAN_STATUS', payload: { state: 'scanning', currentConnector: 'free-work', progress: 0, missionsFound: 0 } };
```

**Step 2: Auto-load mock missions when feed page mounts in dev mode**

In `src/sidepanel/App.svelte`, add after the `completeOnboarding` function:

```typescript
// In dev mode without extension context, auto-load mock missions after onboarding
function maybeAutoLoadMissions() {
  if (import.meta.env.DEV && !globalThis.chrome?.runtime?.id?.startsWith('dev-mode') === false) {
    // chrome stubs are installed — they have id 'dev-mode'
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('dev:missions', {
        detail: generateMockMissions(10),
      }));
    }, 300);
  }
}
```

Actually, simpler: just have the FeedPage auto-receive mock missions. Update the `$effect` in FeedPage that sends `{ type: 'LOAD' }` on mount. The Chrome stub for `SCAN_START` already dispatches `dev:missions` after 800ms. So when the feed loads in dev mode:

1. FeedPage sends `LOAD` → machine goes to `loading` state
2. Since chrome stubs intercept the profile check, app shows the feed
3. User clicks "Scanner" → sends `SCAN_START` → stubs dispatch `dev:missions` after 800ms

No additional code needed — the existing wiring handles it. Just verify it works.

**Step 3: Verify full flow in browser**

1. Open `http://localhost:5173/src/sidepanel/index.html`
2. Complete onboarding (fill in profile, click through steps)
3. See feed page with "Aucune mission" + "Scanner" button
4. Click Scanner → after ~1s, mock missions appear
5. Open DevPanel (Ctrl+Shift+D) → see bridge logs

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(dev): auto-inject mock missions on scan in dev mode"
```

---

## Task 7: Final verification and AGENTS.md update

**Files:**
- Modify: `AGENTS.md`

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: All 20 tests pass (dev code doesn't affect tests).

**Step 2: Run production build**

```bash
pnpm build
```

Expected: Build succeeds. Dev code is tree-shaken.

**Step 3: Verify dev code is not in production bundle**

```bash
grep -r "DEV PANEL\|Chrome Stub\|Bridge logger" dist/ || echo "PASS: no dev code in production build"
```

Expected: `PASS: no dev code in production build`

**Step 4: Update AGENTS.md**

Add a new section after "Conventions de test":

```markdown
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
```

**Step 5: Commit**

```bash
git add -A && git commit -m "docs: add dev experience section to AGENTS.md"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Mock data module | `src/dev/mocks.ts` |
| 2 | Chrome API stubs | `src/dev/chrome-stubs.ts` |
| 3 | Dev bootstrap + XState inspector | `src/dev/index.ts`, `src/sidepanel/main.ts` |
| 4 | Dev Panel component | `src/dev/DevPanel.svelte`, `App.svelte`, `FeedPage.svelte` |
| 5 | Bridge logger | `src/dev/bridge-logger.ts`, `bridge.ts` |
| 6 | Auto-inject mock missions | `chrome-stubs.ts` enhancement |
| 7 | Final verification + docs | `AGENTS.md` |
