# Integration Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire together the Chrome APIs upgrade features so they work as a cohesive whole — SW↔Panel communication, intelligent loading, scan progress, settings UX, and AI indicator.

**Architecture:** The service worker broadcasts scan results via `chrome.runtime.sendMessage`. The side panel loads persisted missions first, then decides whether to re-scan. The scanner reports progress per connector via callback. Settings UX disables interval when auto-scan is off. AI availability is detected once at mount.

**Tech Stack:** Chrome Extensions MV3, TypeScript strict, Svelte 5 runes, XState 5, Vitest, pnpm.

---

## Task 1: Add SCAN_COMPLETE message type to bridge

**Files:**
- Modify: `src/lib/shell/messaging/bridge.ts`

**Step 1: Add the message type**

In `src/lib/shell/messaging/bridge.ts`, add to the `BridgeMessage` union type:

```ts
| { type: 'SCAN_COMPLETE'; payload: Mission[] }
```

**Step 2: Build**

Run: `pnpm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/shell/messaging/bridge.ts
git commit -m "feat: add SCAN_COMPLETE message type to bridge"
```

---

## Task 2: SW broadcasts scan results after alarm scan

**Files:**
- Modify: `src/background/index.ts`

**Step 1: Read the file first**

Read `src/background/index.ts`.

**Step 2: Add sendMessage after successful alarm scan**

In the `chrome.alarms.onAlarm` listener, after `const result = await runScan();` and before the `if (result.missions.length === 0) return;` check, broadcast the results:

```ts
// Notify side panel if open
if (result.missions.length > 0) {
  try {
    await chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', payload: result.missions });
  } catch {
    // Side panel not open, ignore
  }
}
```

Move this BEFORE the early return so the message is always sent when there are missions. The existing badge logic remains after.

**Step 3: Build**

Run: `pnpm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/background/index.ts
git commit -m "feat: SW broadcasts SCAN_COMPLETE after alarm scan"
```

---

## Task 3: FeedPage loads persisted missions + listens for background scans

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte`

**Step 1: Read the file**

Read `src/ui/pages/FeedPage.svelte`.

**Step 2: Add import for getMissions and getSettings**

Add to the imports:

```ts
import { getMissions } from '$lib/shell/storage/db';
import { getSettings } from '$lib/shell/storage/chrome-storage';
```

**Step 3: Replace the auto-scan on mount**

Find `// Auto-scan on mount` and `startScan();` (around line 177). Replace with:

```ts
// Smart load: use persisted data if fresh, scan only if stale
async function smartLoad() {
  try {
    const [stored, settings] = await Promise.all([getMissions(), getSettings()]);
    if (stored.length > 0) {
      feedActor.send({ type: 'MISSIONS_LOADED', missions: stored });
      // Check if data is fresh enough (last scan within interval)
      const lastSyncKey = 'lastGlobalSync';
      const result = await chrome.storage.local.get(lastSyncKey);
      const lastSync = result[lastSyncKey] as number | undefined;
      const intervalMs = settings.scanIntervalMinutes * 60 * 1000;
      if (lastSync && Date.now() - lastSync < intervalMs) return;
    }
    startScan();
  } catch {
    startScan();
  }
}
smartLoad();
```

**Step 4: Update startScan to save lastGlobalSync**

In the `startScan` function, after `feedActor.send({ type: 'MISSIONS_LOADED', missions: result.missions });`, add:

```ts
try { await chrome.storage.local.set({ lastGlobalSync: Date.now() }); } catch {}
```

Also update the SW alarm handler in `src/background/index.ts` — after `await runScan()`, add:

```ts
try { await chrome.storage.local.set({ lastGlobalSync: Date.now() }); } catch {}
```

**Step 5: Add listener for background scan results**

After the `smartLoad()` call, add:

```ts
// Listen for background scan results from service worker
$effect(() => {
  function handleMessage(message: any) {
    if (message?.type === 'SCAN_COMPLETE' && Array.isArray(message.payload)) {
      feedActor.send({ type: 'MISSIONS_LOADED', missions: message.payload });
    }
  }
  chrome.runtime.onMessage.addListener(handleMessage);
  return () => {
    chrome.runtime.onMessage.removeListener(handleMessage);
  };
});
```

Wrap in try/catch if outside extension context.

**Step 6: Build**

Run: `pnpm run build`
Expected: PASS

**Step 7: Commit**

```bash
git add src/ui/pages/FeedPage.svelte src/background/index.ts
git commit -m "feat: smart load from IndexedDB + listen for background scan results"
```

---

## Task 4: Settings UX — disable interval when auto-scan is off

**Files:**
- Modify: `src/ui/pages/SettingsPage.svelte`

**Step 1: Read the file**

Read `src/ui/pages/SettingsPage.svelte` around lines 331-351 (the intervalle de scan section).

**Step 2: Add conditional classes and help text**

Replace the intervalle de scan section card opening div:

From:
```svelte
<div class="section-card rounded-[1.5rem] p-4 space-y-3">
```

To:
```svelte
<div class="section-card rounded-[1.5rem] p-4 space-y-3 transition-opacity duration-200" class:opacity-40={!autoScan} class:pointer-events-none={!autoScan}>
```

After the closing `</div>` of this section (after the `{scanInterval} min` paragraph), but INSIDE the section-card div, add:

```svelte
{#if !autoScan}
  <p class="text-center text-[11px] text-text-muted">Activez le scan automatique pour configurer la frequence.</p>
{/if}
```

**Step 3: Build**

Run: `pnpm run build`
Expected: PASS, no warnings

**Step 4: Commit**

```bash
git add src/ui/pages/SettingsPage.svelte
git commit -m "feat(ui): disable scan interval when auto-scan is off"
```

---

## Task 5: Add onProgress callback to scanner

**Files:**
- Modify: `src/lib/shell/scan/scanner.ts`

**Step 1: Read the file**

Read `src/lib/shell/scan/scanner.ts`.

**Step 2: Add ScanProgressInfo type and onProgress parameter**

At the top, after the `ScanResult` interface, add:

```ts
export interface ScanProgressInfo {
  current: number;
  total: number;
  connectorName: string;
}
```

Update the `runScan` signature:

```ts
export async function runScan(signal?: AbortSignal, onProgress?: (info: ScanProgressInfo) => void): Promise<ScanResult> {
```

**Step 3: Emit progress before and after each connector fetch**

Replace the existing `Promise.allSettled` block with sequential fetching that reports progress:

```ts
// Fetch connectors sequentially to report progress
const connectorResults: { connectorId: string; missions: Mission[] }[] = [];
for (let i = 0; i < connectors.length; i++) {
  if (signal?.aborted) {
    try { await setScanState('idle'); } catch {}
    return { missions: [], errors };
  }
  const connector = connectors[i];
  onProgress?.({ current: i, total: connectors.length, connectorName: connector.name });
  try {
    const missions = await connector.fetchMissions();
    connectorResults.push({ connectorId: connector.id, missions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    errors.push({ connectorId: connector.id, message });
  }
}
onProgress?.({ current: connectors.length, total: connectors.length, connectorName: '' });
```

Then update the allMissions aggregation to use `connectorResults` instead of `results`:

```ts
const allMissions: Mission[] = [];
for (const result of connectorResults) {
  allMissions.push(...result.missions);
}
```

**Step 4: Build**

Run: `pnpm run build`
Expected: PASS

**Step 5: Run existing tests**

Run: `pnpm vitest run`
Expected: All pass (scanner tests don't call runScan directly with real connectors)

**Step 6: Commit**

```bash
git add src/lib/shell/scan/scanner.ts
git commit -m "feat: add onProgress callback to scanner for per-connector progress"
```

---

## Task 6: Wire scan progress into FeedPage

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte`

**Step 1: Read the file**

Read `src/ui/pages/FeedPage.svelte`.

**Step 2: Add progress state variables**

Near the other state declarations (after `let scanController`), add:

```ts
let scanCurrent = $state(0);
let scanTotal = $state(0);
let scanConnectorName = $state('');
```

**Step 3: Add derived progress percentage**

```ts
let scanPercent = $derived(scanTotal > 0 ? Math.round((scanCurrent / scanTotal) * 100) : 0);
```

**Step 4: Pass onProgress callback in startScan**

In the `startScan` function, change:
```ts
const result = await runScan(scanController.signal);
```
To:
```ts
const result = await runScan(scanController.signal, (info) => {
  scanCurrent = info.current;
  scanTotal = info.total;
  scanConnectorName = info.connectorName;
});
```

Also reset progress at the start of `startScan` (after `feedActor.send({ type: 'LOAD' });`):
```ts
scanCurrent = 0;
scanTotal = 0;
scanConnectorName = '';
```

**Step 5: Update ScanProgress props**

Find the `<ScanProgress` usage and replace:

```svelte
<ScanProgress isScanning={isLoading} progress={scanPercent} missionsFound={totalMissions} connectorName={scanConnectorName} current={scanCurrent} total={scanTotal} />
```

**Step 6: Build**

Run: `pnpm run build`
Expected: May warn about unknown props on ScanProgress — that's fine, we fix it in Task 7.

**Step 7: Commit**

```bash
git add src/ui/pages/FeedPage.svelte
git commit -m "feat(ui): wire scan progress state into FeedPage"
```

---

## Task 7: Update ScanProgress component

**Files:**
- Modify: `src/ui/organisms/ScanProgress.svelte`

**Step 1: Read the file**

Read `src/ui/organisms/ScanProgress.svelte`.

**Step 2: Replace with enhanced version**

Replace the entire file:

```svelte
<script lang="ts">
  let {
    progress = 0,
    isScanning = false,
    missionsFound = 0,
    connectorName = '',
    current = 0,
    total = 0,
  }: {
    progress?: number;
    isScanning?: boolean;
    missionsFound?: number;
    connectorName?: string;
    current?: number;
    total?: number;
  } = $props();
</script>

{#if isScanning}
  <div class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
    <div
      class="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-emerald to-accent-blue transition-all duration-500 ease-out"
      style:width="{Math.max(progress, 5)}%"
    ></div>
  </div>
  <p class="px-1 pt-2 text-[11px] text-text-secondary transition-opacity duration-300">
    {#if connectorName}
      Scraping {connectorName}... ({current}/{total})
    {:else if missionsFound > 0}
      {missionsFound} mission{missionsFound > 1 ? 's' : ''} reperee{missionsFound > 1 ? 's' : ''} pendant le scan
    {:else}
      Demarrage du scan...
    {/if}
  </p>
{/if}
```

**Step 3: Build**

Run: `pnpm run build`
Expected: PASS, no warnings

**Step 4: Commit**

```bash
git add src/ui/organisms/ScanProgress.svelte
git commit -m "feat(ui): show per-connector scan progress with name and count"
```

---

## Task 8: Add Gemini Nano availability indicator in FeedPage

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte`

**Step 1: Read the file**

Read `src/ui/pages/FeedPage.svelte`.

**Step 2: Add import and state**

Add import:
```ts
import { isPromptApiAvailable, type AiAvailability } from '$lib/shell/ai/capabilities';
```

Add state (near other state declarations):
```ts
let aiStatus = $state<AiAvailability>('no');
```

Add $effect (near other $effects):
```ts
$effect(() => {
  isPromptApiAvailable().then(status => { aiStatus = status; }).catch(() => {});
});
```

**Step 3: Add badge in the stats grid**

Find the stats grid (`<div class="mt-4 grid grid-cols-3 gap-2">`). After the closing `</div>` of the grid, add:

```svelte
{#if aiStatus === 'after-download'}
  <p class="mt-2 text-center text-[11px] text-text-muted">Scoring IA en telechargement...</p>
{:else if aiStatus === 'no'}
  <p class="mt-2 text-center text-[11px] text-text-muted">Scoring IA indisponible</p>
{/if}
```

When `aiStatus === 'available'`, nothing is shown (no visual noise).

**Step 4: Build**

Run: `pnpm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ui/pages/FeedPage.svelte
git commit -m "feat(ui): show Gemini Nano availability indicator in feed header"
```

---

## Task 9: Final integration build and test

**Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 2: Run build**

Run: `pnpm run build`
Expected: Clean build, no warnings

**Step 3: Commit if cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for integration gaps"
```
