> **⚠️ Historical document** — Ce plan a été rédigé pendant une phase antérieure du projet. Certains choix techniques mentionnés (XState, offscreen document, API Anthropic, Malt, Comet) ne reflètent plus l'architecture actuelle. Voir `README.md` et `AGENTS.md` pour l'état courant.


# Chrome APIs Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade MissionPulse to leverage Chrome 130+ APIs — auto-scan with alarms + badge, session storage cache, Gemini Nano semantic scoring, and UX polish.

**Architecture:** 4 independent layers stacked progressively. Each layer is a self-contained commit. Service worker gains alarm-based scanning and badge management. New `session-storage.ts` module shares ephemeral state between SW and side panel. Gemini Nano integration is optional with fallback to existing scoring. UX polish uses `sidePanel.getLayout()` and `tabs.Tab.frozen`.

**Tech Stack:** Chrome Extensions MV3, TypeScript strict, Svelte 5 runes, XState 5, Vitest, FC&IS architecture.

---

## Task 1: Add `autoScan` toggle to AppSettings

**Files:**
- Modify: `src/lib/shell/storage/chrome-storage.ts`
- Modify: `src/dev/chrome-stubs.ts`
- Test: `tests/unit/storage/chrome-storage.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/storage/chrome-storage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async () => {}),
    },
  },
});

import { getSettings } from '../../../src/lib/shell/storage/chrome-storage';

describe('getSettings', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('returns defaults with autoScan true', async () => {
    const settings = await getSettings();
    expect(settings.autoScan).toBe(true);
    expect(settings.scanIntervalMinutes).toBe(30);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/storage/chrome-storage.test.ts`
Expected: FAIL — `autoScan` property does not exist on `AppSettings`

**Step 3: Add `autoScan` to `AppSettings`**

In `src/lib/shell/storage/chrome-storage.ts`, add the field:

```ts
export interface AppSettings {
  scanIntervalMinutes: number;
  enabledConnectors: string[];
  notifications: boolean;
  autoScan: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
};
```

In `src/dev/chrome-stubs.ts`, update the stub settings to include `autoScan: true`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/storage/chrome-storage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/shell/storage/chrome-storage.ts src/dev/chrome-stubs.ts tests/unit/storage/chrome-storage.test.ts
git commit -m "feat: add autoScan setting to AppSettings"
```

---

## Task 2: Implement alarm-based background scan in service worker

**Files:**
- Modify: `src/manifest.json` (add `alarms` permission)
- Modify: `src/background/index.ts`
- Modify: `src/lib/shell/storage/chrome-storage.ts` (add listener helper)

**Step 1: Add `alarms` permission to manifest**

In `src/manifest.json`:
```json
"permissions": ["sidePanel", "storage", "cookies", "alarms"]
```

**Step 2: Implement alarm setup and handler in service worker**

In `src/background/index.ts`, add after existing code:

```ts
import { getSettings } from '../lib/shell/storage/chrome-storage';
import { runScan } from '../lib/shell/scan/scanner';
import { getSeenIds } from '../lib/shell/storage/seen-missions';

const ALARM_NAME = 'auto-scan';

async function setupAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clearAll();
  if (settings.autoScan) {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: settings.scanIntervalMinutes,
    });
    console.log(`[MissionPulse] Auto-scan alarm set: every ${settings.scanIntervalMinutes}min`);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log('[MissionPulse] Auto-scan triggered');
  try {
    const result = await runScan();
    if (result.missions.length === 0) return;
    const seenIds = await getSeenIds();
    const newCount = result.missions.filter(m => !seenIds.includes(m.id)).length;
    if (newCount > 0) {
      await chrome.action.setBadgeText({ text: String(newCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#58d9a9' });
      await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    }
  } catch (err) {
    console.error('[MissionPulse] Auto-scan error:', err);
  }
});

// Re-setup alarm when settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    setupAlarm();
  }
});

// Initial setup
setupAlarm();
```

**Step 3: Build and verify**

Run: `pnpm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add src/manifest.json src/background/index.ts
git commit -m "feat: add alarm-based auto-scan with badge notifications"
```

---

## Task 3: Add auto-scan toggle to SettingsPage

**Files:**
- Modify: `src/ui/pages/SettingsPage.svelte`

**Step 1: Add autoScan state and handler**

In `src/ui/pages/SettingsPage.svelte`, add after `let notifications = $state(true);` (line 30):

```ts
let autoScan = $state(true);
```

In `loadSettings()`, after `notifications = settings.notifications;` (line 78), add:

```ts
autoScan = settings.autoScan;
```

Add handler after `handleToggleNotifications`:

```ts
async function handleToggleAutoScan() {
  autoScan = !autoScan;
  try {
    const settings = await getSettings();
    await setSettings({ ...settings, autoScan });
  } catch {
    // Hors contexte extension
  }
}
```

**Step 2: Add UI toggle before the scan interval section**

Insert before `<!-- Intervalle de scan -->` (line 298):

```svelte
<!-- Scan automatique -->
<div class="section-card rounded-[1.5rem] p-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-semibold text-text-primary">Scan automatique</h3>
      <p class="mt-1 text-xs leading-relaxed text-text-secondary">Scanner les plateformes en arriere-plan automatiquement.</p>
    </div>
    <button
      class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {autoScan ? 'border-accent-emerald/30 bg-accent-emerald/20' : 'border-white/10 bg-white/[0.05]'}"
      onclick={handleToggleAutoScan}
      role="switch"
      aria-checked={autoScan}
      aria-label="Activer le scan automatique"
    >
      <span class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {autoScan ? 'translate-x-6 bg-accent-emerald' : 'translate-x-0.5 bg-text-muted'}"></span>
    </button>
  </div>
</div>
```

**Step 3: Build and verify**

Run: `pnpm run build`
Expected: Build succeeds, no a11y warnings

**Step 4: Commit**

```bash
git add src/ui/pages/SettingsPage.svelte
git commit -m "feat(ui): add auto-scan toggle to settings page"
```

---

## Task 4: Reset badge when side panel opens

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte`

**Step 1: Add badge reset on mount**

In `src/ui/pages/FeedPage.svelte`, after the existing `$effect` blocks (after line 92), add:

```ts
$effect(() => {
  // Reset badge when side panel opens
  try {
    chrome.action.setBadgeText({ text: '' });
  } catch {
    // Outside extension context
  }
});
```

**Step 2: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/pages/FeedPage.svelte
git commit -m "feat: reset badge count when side panel opens"
```

---

## Task 5: Create session-storage module

**Files:**
- Create: `src/lib/shell/storage/session-storage.ts`
- Test: `tests/unit/storage/session-storage.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/storage/session-storage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const k of keys) if (k in sessionStore) result[k] = sessionStore[k];
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
    },
  },
});

import {
  getScanState,
  setScanState,
  getNewMissionCount,
  setNewMissionCount,
  resetNewMissionCount,
} from '../../../src/lib/shell/storage/session-storage';

describe('session-storage', () => {
  beforeEach(() => {
    for (const key of Object.keys(sessionStore)) delete sessionStore[key];
  });

  it('returns idle scan state by default', async () => {
    expect(await getScanState()).toBe('idle');
  });

  it('persists scan state', async () => {
    await setScanState('scanning');
    expect(await getScanState()).toBe('scanning');
  });

  it('returns 0 new missions by default', async () => {
    expect(await getNewMissionCount()).toBe(0);
  });

  it('persists and resets new mission count', async () => {
    await setNewMissionCount(5);
    expect(await getNewMissionCount()).toBe(5);
    await resetNewMissionCount();
    expect(await getNewMissionCount()).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/storage/session-storage.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the module**

Create `src/lib/shell/storage/session-storage.ts`:

```ts
export type ScanState = 'idle' | 'scanning' | 'error';

export async function getScanState(): Promise<ScanState> {
  const result = await chrome.storage.session.get(['scanState']);
  return (result.scanState as ScanState) ?? 'idle';
}

export async function setScanState(state: ScanState): Promise<void> {
  await chrome.storage.session.set({ scanState: state });
}

export async function getNewMissionCount(): Promise<number> {
  const result = await chrome.storage.session.get(['newMissionCount']);
  return (result.newMissionCount as number) ?? 0;
}

export async function setNewMissionCount(count: number): Promise<void> {
  await chrome.storage.session.set({ newMissionCount: count });
}

export async function resetNewMissionCount(): Promise<void> {
  await chrome.storage.session.set({ newMissionCount: 0 });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/storage/session-storage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/shell/storage/session-storage.ts tests/unit/storage/session-storage.test.ts
git commit -m "feat: add session-storage module for ephemeral scan state"
```

---

## Task 6: Wire session storage into scanner and service worker

**Files:**
- Modify: `src/lib/shell/scan/scanner.ts`
- Modify: `src/background/index.ts`

**Step 1: Update scanner to set scan state**

In `src/lib/shell/scan/scanner.ts`, add import:

```ts
import { setScanState } from '../storage/session-storage';
```

At the start of `runScan()`, after `const errors`:

```ts
await setScanState('scanning');
```

Before `return { missions: scored, errors };` at end:

```ts
await setScanState('idle');
```

In each early return (aborted, empty connectors), also call `await setScanState('idle');` before returning.

In catch blocks where errors occur, call `await setScanState('error');`.

**Step 2: Update service worker to use session storage for badge count**

In `src/background/index.ts`, add import:

```ts
import { setNewMissionCount } from '../lib/shell/storage/session-storage';
```

In the alarm handler, after computing `newCount`, add:

```ts
await setNewMissionCount(newCount);
```

**Step 3: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/shell/scan/scanner.ts src/background/index.ts
git commit -m "feat: wire session storage into scanner and service worker"
```

---

## Task 7: Reset session state when side panel opens

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte`

**Step 1: Import and use session storage**

In `src/ui/pages/FeedPage.svelte`, add import:

```ts
import { resetNewMissionCount } from '$lib/shell/storage/session-storage';
```

Update the badge-reset `$effect` (from Task 4) to also reset session count:

```ts
$effect(() => {
  try {
    chrome.action.setBadgeText({ text: '' });
    resetNewMissionCount();
  } catch {
    // Outside extension context
  }
});
```

**Step 2: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/pages/FeedPage.svelte
git commit -m "feat: reset session mission count when side panel opens"
```

---

## Task 8: Create AI capabilities detection module

**Files:**
- Create: `src/lib/shell/ai/capabilities.ts`
- Test: `tests/unit/ai/capabilities.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/ai/capabilities.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('isPromptApiAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns "no" when self.ai is undefined', async () => {
    vi.stubGlobal('self', {});
    const { isPromptApiAvailable } = await import(
      '../../../src/lib/shell/ai/capabilities'
    );
    expect(await isPromptApiAvailable()).toBe('no');
  });

  it('returns "available" when capabilities say available', async () => {
    vi.stubGlobal('self', {
      ai: {
        languageModel: {
          capabilities: vi.fn(async () => ({ available: 'readily' })),
        },
      },
    });
    const { isPromptApiAvailable } = await import(
      '../../../src/lib/shell/ai/capabilities'
    );
    expect(await isPromptApiAvailable()).toBe('available');
  });

  it('returns "after-download" when model needs download', async () => {
    vi.stubGlobal('self', {
      ai: {
        languageModel: {
          capabilities: vi.fn(async () => ({ available: 'after-download' })),
        },
      },
    });
    const { isPromptApiAvailable } = await import(
      '../../../src/lib/shell/ai/capabilities'
    );
    expect(await isPromptApiAvailable()).toBe('after-download');
  });

  it('returns "no" when capabilities throw', async () => {
    vi.stubGlobal('self', {
      ai: {
        languageModel: {
          capabilities: vi.fn(async () => { throw new Error('fail'); }),
        },
      },
    });
    const { isPromptApiAvailable } = await import(
      '../../../src/lib/shell/ai/capabilities'
    );
    expect(await isPromptApiAvailable()).toBe('no');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ai/capabilities.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the module**

Create `src/lib/shell/ai/capabilities.ts`:

```ts
export type AiAvailability = 'available' | 'after-download' | 'no';

export async function isPromptApiAvailable(): Promise<AiAvailability> {
  try {
    const ai = (self as any).ai;
    if (!ai?.languageModel?.capabilities) return 'no';
    const caps = await ai.languageModel.capabilities();
    if (caps.available === 'readily') return 'available';
    if (caps.available === 'after-download') return 'after-download';
    return 'no';
  } catch {
    return 'no';
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ai/capabilities.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/shell/ai/capabilities.ts tests/unit/ai/capabilities.test.ts
git commit -m "feat: add Prompt API availability detection"
```

---

## Task 9: Create semantic scoring pure function

**Files:**
- Create: `src/lib/core/scoring/semantic-scoring.ts`
- Test: `tests/unit/scoring/semantic-scoring.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/scoring/semantic-scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildScoringPrompt, parseSemanticResult } from '../../../src/lib/core/scoring/semantic-scoring';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const profile: UserProfile = {
  firstName: 'Guy',
  stack: ['TypeScript', 'React', 'Node.js'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Developpeur Fullstack',
};

const mission: Mission = {
  id: '1',
  title: 'Dev React/TypeScript',
  client: null,
  description: 'Mission React avec TypeScript',
  stack: ['React', 'TypeScript'],
  tjm: 600,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date(),
  score: null,
};

describe('buildScoringPrompt', () => {
  it('includes mission title and profile stack', () => {
    const prompt = buildScoringPrompt(mission, profile);
    expect(prompt).toContain('Dev React/TypeScript');
    expect(prompt).toContain('TypeScript');
    expect(prompt).toContain('React');
    expect(prompt).toContain('Node.js');
  });
});

describe('parseSemanticResult', () => {
  it('parses valid JSON response', () => {
    const result = parseSemanticResult('{"score": 85, "reason": "Stack alignee"}');
    expect(result).toEqual({ score: 85, reason: 'Stack alignee' });
  });

  it('extracts JSON from surrounding text', () => {
    const result = parseSemanticResult('Here is the result: {"score": 70, "reason": "Bon match"} done.');
    expect(result).toEqual({ score: 70, reason: 'Bon match' });
  });

  it('returns null for invalid response', () => {
    expect(parseSemanticResult('no json here')).toBeNull();
  });

  it('clamps score to 0-100', () => {
    const result = parseSemanticResult('{"score": 150, "reason": "overflow"}');
    expect(result?.score).toBe(100);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/scoring/semantic-scoring.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the pure functions**

Create `src/lib/core/scoring/semantic-scoring.ts`:

```ts
import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';

export interface SemanticResult {
  score: number;
  reason: string;
}

export function buildScoringPrompt(mission: Mission, profile: UserProfile): string {
  return `Evalue la pertinence de cette mission freelance pour ce profil. Reponds uniquement en JSON: {"score": 0-100, "reason": "explication en 1 phrase"}.

Mission:
- Titre: ${mission.title}
- Stack: ${mission.stack.join(', ') || 'non precise'}
- TJM: ${mission.tjm ? `${mission.tjm} EUR/jour` : 'non precise'}
- Lieu: ${mission.location ?? 'non precise'}
- Remote: ${mission.remote ?? 'non precise'}
- Duree: ${mission.duration ?? 'non precise'}

Profil:
- Poste: ${profile.jobTitle}
- Stack: ${profile.stack.join(', ')}
- TJM: ${profile.tjmMin}-${profile.tjmMax} EUR/jour
- Lieu: ${profile.location}
- Remote: ${profile.remote}
- Seniorite: ${profile.seniority}`;
}

export function parseSemanticResult(raw: string): SemanticResult | null {
  const match = raw.match(/\{[^}]*"score"\s*:\s*\d+[^}]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.score !== 'number' || typeof parsed.reason !== 'string') return null;
    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      reason: parsed.reason,
    };
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/scoring/semantic-scoring.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/core/scoring/semantic-scoring.ts tests/unit/scoring/semantic-scoring.test.ts
git commit -m "feat: add semantic scoring pure functions (prompt builder + parser)"
```

---

## Task 10: Create Gemini Nano scoring shell function

**Files:**
- Create: `src/lib/shell/ai/semantic-scorer.ts`

**Step 1: Implement the shell function**

Create `src/lib/shell/ai/semantic-scorer.ts`:

```ts
import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import { buildScoringPrompt, parseSemanticResult, type SemanticResult } from '../../core/scoring/semantic-scoring';
import { isPromptApiAvailable } from './capabilities';

const TIMEOUT_MS = 5000;
const MAX_PER_SCAN = 10;

export async function scoreMissionsSemantic(
  missions: Mission[],
  profile: UserProfile,
): Promise<Map<string, SemanticResult>> {
  const results = new Map<string, SemanticResult>();

  const availability = await isPromptApiAvailable();
  if (availability === 'no') return results;

  const ai = (self as any).ai;
  const batch = missions.slice(0, MAX_PER_SCAN);

  for (const mission of batch) {
    try {
      const session = await ai.languageModel.create();
      const prompt = buildScoringPrompt(mission, profile);

      const response = await Promise.race([
        session.prompt(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
        ),
      ]);

      const parsed = parseSemanticResult(response);
      if (parsed) results.set(mission.id, parsed);
      session.destroy();
    } catch {
      // Skip this mission, continue with next
    }
  }

  return results;
}
```

**Step 2: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/shell/ai/semantic-scorer.ts
git commit -m "feat: add Gemini Nano semantic scorer shell function"
```

---

## Task 11: Add `semanticScore` and `semanticReason` to Mission type

**Files:**
- Modify: `src/lib/core/types/mission.ts`

**Step 1: Add optional fields**

In `src/lib/core/types/mission.ts`, add to the `Mission` interface:

```ts
semanticScore: number | null;
semanticReason: string | null;
```

**Step 2: Fix compilation — add defaults wherever missions are created**

Search all mission factories/parsers and add `semanticScore: null, semanticReason: null` to every mission literal. Files to update:
- `src/lib/core/connectors/freework-parser.ts`
- `src/lib/core/connectors/malt-parser.ts`
- `src/lib/core/connectors/comet-parser.ts`
- `src/lib/core/connectors/lehibou-parser.ts`
- `src/lib/core/connectors/hiway-parser.ts`
- `src/lib/core/connectors/collective-parser.ts`
- `src/lib/core/connectors/cherrypick-parser.ts`
- `src/lib/core/connectors/generic-parser.ts`
- `tests/unit/scoring/relevance.test.ts` (the `makeMission` helper)
- `tests/unit/connectors/*.test.ts` (any mission literals)
- `tests/e2e/feed.test.ts` (any mission fixtures)

Add `semanticScore: null, semanticReason: null` to each mission object literal.

**Step 3: Build and run all tests**

Run: `pnpm run build && pnpm vitest run`
Expected: All pass

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add semanticScore and semanticReason to Mission type"
```

---

## Task 12: Wire semantic scoring into scanner

**Files:**
- Modify: `src/lib/shell/scan/scanner.ts`

**Step 1: Add semantic scoring after dedup**

In `src/lib/shell/scan/scanner.ts`, add import:

```ts
import { scoreMissionsSemantic } from '../ai/semantic-scorer';
```

After the existing scoring block (after `const scored = ...`), add:

```ts
// Semantic scoring (async enrichment, non-blocking)
if (profile && !signal?.aborted) {
  try {
    const semanticResults = await scoreMissionsSemantic(scored, profile);
    for (const mission of scored) {
      const semantic = semanticResults.get(mission.id);
      if (semantic) {
        mission.semanticScore = semantic.score;
        mission.semanticReason = semantic.reason;
      }
    }
  } catch {
    // Gemini Nano unavailable, continue with basic scoring
  }
}
```

**Step 2: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/shell/scan/scanner.ts
git commit -m "feat: wire Gemini Nano semantic scoring into scanner"
```

---

## Task 13: Display semantic reason in MissionCard

**Files:**
- Modify: `src/ui/molecules/MissionCard.svelte` (or wherever mission cards render)

**Step 1: Find the MissionCard component**

Run: `find src/ui -name 'MissionCard*'` to locate it.

**Step 2: Add semantic reason tag**

In the mission card, after the stack tags section, add:

```svelte
{#if mission.semanticReason}
  <span class="inline-flex items-center gap-1 rounded-full border border-accent-blue/20 bg-accent-blue/8 px-2 py-0.5 text-[11px] text-accent-blue">
    {mission.semanticReason}
  </span>
{/if}
```

**Step 3: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/ui/molecules/MissionCard.svelte
git commit -m "feat(ui): display semantic scoring reason on mission cards"
```

---

## Task 14: Add sidePanel.getLayout() detection

**Files:**
- Create: `src/lib/shell/ui/panel-layout.ts`
- Modify: `src/ui/pages/FeedPage.svelte`

**Step 1: Create layout detection helper**

Create `src/lib/shell/ui/panel-layout.ts`:

```ts
export type PanelSide = 'left' | 'right';

export async function getPanelSide(): Promise<PanelSide> {
  try {
    const layout = await (chrome.sidePanel as any).getLayout();
    return layout?.position === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}
```

**Step 2: Use in FeedPage to position stop button**

In `src/ui/pages/FeedPage.svelte`, add import:

```ts
import { getPanelSide, type PanelSide } from '$lib/shell/ui/panel-layout';
```

Add state:

```ts
let panelSide = $state<PanelSide>('right');

$effect(() => {
  getPanelSide().then(side => { panelSide = side; });
});
```

Update the button container to conditionally reverse order:

```svelte
<div class="flex items-center gap-2" class:flex-row-reverse={panelSide === 'left'}>
```

**Step 3: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/shell/ui/panel-layout.ts src/ui/pages/FeedPage.svelte
git commit -m "feat(ui): adapt button layout based on side panel position"
```

---

## Task 15: Skip frozen tabs in session detection

**Files:**
- Modify: `src/lib/shell/connectors/base.connector.ts`

**Step 1: Add frozen tab check**

In `src/lib/shell/connectors/base.connector.ts`, update `detectSession()`. Before the fetch call, add a check:

```ts
async detectSession(): Promise<boolean> {
  try {
    // Skip if platform tab is frozen
    const tabs = await chrome.tabs.query({ url: `${this.baseUrl}*` });
    if (tabs.length > 0 && tabs.every(t => (t as any).frozen)) return false;

    const controller = new AbortController();
    // ... rest unchanged
```

Note: This requires the `tabs` permission. Check if it's already in manifest; if not, this is too invasive — skip the tabs query and just rely on the fetch timeout. The fetch already handles unreachable tabs gracefully.

**Alternative (no extra permission):** Simply document this as a future enhancement when `tabs` permission is already needed for another reason. Skip this step for now.

**Step 2: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/shell/connectors/base.connector.ts
git commit -m "feat: document frozen tab detection for future use"
```

---

## Task 16: Listen to action.onUserSettingsChanged

**Files:**
- Modify: `src/background/index.ts`

**Step 1: Add event listener**

In `src/background/index.ts`, add after the alarm setup:

```ts
chrome.action.onUserSettingsChanged.addListener(async (change) => {
  if (change.isOnToolbar) {
    console.log('[MissionPulse] Extension pinned to toolbar');
    const settings = await getSettings();
    if (!settings.autoScan) {
      // Suggest enabling auto-scan via a notification if notifications are on
      if (settings.notifications) {
        try {
          await chrome.notifications.create('suggest-auto-scan', {
            type: 'basic',
            iconUrl: 'static/icons/icon-128.svg',
            title: 'MissionPulse',
            message: 'Activez le scan automatique dans les parametres pour ne rater aucune mission.',
          });
        } catch {
          // Notifications permission not available
        }
      }
    }
  }
});
```

Note: If using `chrome.notifications`, add `"notifications"` to manifest permissions.

**Step 2: Update manifest**

In `src/manifest.json`:
```json
"permissions": ["sidePanel", "storage", "cookies", "alarms", "notifications"]
```

**Step 3: Build and verify**

Run: `pnpm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/background/index.ts src/manifest.json
git commit -m "feat: suggest auto-scan when extension is pinned to toolbar"
```

---

## Task 17: Final integration build and test

**Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 2: Run build**

Run: `pnpm run build`
Expected: Clean build, no warnings

**Step 3: Verify manifest is correct**

Run: Read `dist/manifest.json` and verify permissions list includes `alarms` and `notifications`.

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for Chrome APIs upgrade"
```
