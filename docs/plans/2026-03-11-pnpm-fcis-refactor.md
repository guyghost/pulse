> **⚠️ Historical document** — Ce plan a été rédigé pendant une phase antérieure du projet. Certains choix techniques mentionnés (XState, offscreen document, API Anthropic, Malt, Comet) ne reflètent plus l'architecture actuelle. Voir `README.md` et `AGENTS.md` pour l'état courant.


# pnpm Migration + FC&IS Refactoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from npm to pnpm and restructure `src/lib/` into explicit `core/` (pure) and `shell/` (I/O) layers following Functional Core & Imperative Shell.

**Architecture:** Move pure functions (scoring, dedup, aggregation, HTML parsing) into `src/lib/core/` with zero I/O imports. Move all I/O (storage, messaging, connectors, use cases) into `src/lib/shell/`. Extract `llm-analyzer.ts` into a shell use case. Inject `now: Date` and ID generators into Core functions.

**Tech Stack:** TypeScript strict, Vitest, pnpm

**Skills:** @architecture for FC&IS patterns

---

## Task 1: Migrate to pnpm

**Files:**
- Delete: `package-lock.json`
- Create: `pnpm-lock.yaml` (generated)

**Step 1: Remove npm lockfile and node_modules**

```bash
rm package-lock.json && rm -rf node_modules
```

**Step 2: Install with pnpm**

```bash
pnpm install
```

**Step 3: Verify tests pass**

```bash
pnpm test
```

Expected: All 3 test suites pass (scoring, connectors, aggregator).

**Step 4: Verify build**

```bash
pnpm build
```

Expected: `dist/` folder created without errors.

**Step 5: Commit**

```bash
git add -A && git commit -m "chore: migrate from npm to pnpm"
```

---

## Task 2: Create core/ directory and move types

**Files:**
- Create: `src/lib/core/types/mission.ts` (moved from `src/lib/types/mission.ts`)
- Create: `src/lib/core/types/connector.ts` (moved from `src/lib/types/connector.ts`)
- Create: `src/lib/core/types/tjm.ts` (moved from `src/lib/types/tjm.ts`)
- Create: `src/lib/core/types/profile.ts` (moved from `src/lib/types/profile.ts`)
- Delete: `src/lib/types/` (entire directory)

**Step 1: Create core/types/ and move files**

```bash
mkdir -p src/lib/core/types
mv src/lib/types/mission.ts src/lib/core/types/mission.ts
mv src/lib/types/connector.ts src/lib/core/types/connector.ts
mv src/lib/types/tjm.ts src/lib/core/types/tjm.ts
mv src/lib/types/profile.ts src/lib/core/types/profile.ts
rmdir src/lib/types
```

**Step 2: Update internal imports within core/types/**

In `src/lib/core/types/connector.ts`, update:
```typescript
// OLD
import type { Mission } from './mission';
// NEW (no change needed — same relative path)
```

In `src/lib/core/types/profile.ts`, update:
```typescript
// OLD
import type { SeniorityLevel } from './tjm';
import type { RemoteType } from './mission';
// NEW (no change needed — same relative path)
```

No changes needed inside the type files since they only reference each other.

**Step 3: Update all imports across the codebase**

Files referencing `../lib/types/` or `$lib/types/`:

| File | Old import path | New import path |
|------|----------------|-----------------|
| `src/background/index.ts` | `../lib/types/profile` | `../lib/core/types/profile` |
| `src/background/machines/scan.machine.ts` | `../../lib/types/mission` | `../../lib/core/types/mission` |
| `src/background/machines/scan.machine.ts` | `../../lib/types/connector` | `../../lib/core/types/connector` |
| `src/background/machines/connector.machine.ts` | `../../lib/types/mission` | `../../lib/core/types/mission` |
| `src/background/machines/connector.machine.ts` | `../../lib/types/connector` | `../../lib/core/types/connector` |
| `src/machines/feed.machine.ts` | `../lib/types/mission` | `../lib/core/types/mission` |
| `src/machines/filters.machine.ts` | `../lib/types/mission` | `../lib/core/types/mission` |
| `src/machines/onboarding.machine.ts` | `../lib/types/profile` | `../lib/core/types/profile` |
| `src/machines/tjm.machine.ts` | `../lib/types/tjm` | `../lib/core/types/tjm` |
| `src/lib/scoring/relevance.ts` | `../types/mission` | `../core/types/mission` (temporary — will move in Task 3) |
| `src/lib/scoring/relevance.ts` | `../types/profile` | `../core/types/profile` (temporary) |
| `src/lib/scoring/dedup.ts` | `../types/mission` | `../core/types/mission` (temporary) |
| `src/lib/tjm/aggregator.ts` | `../types/tjm` | `../core/types/tjm` (temporary) |
| `src/lib/tjm/cache.ts` | `../types/tjm` | `../core/types/tjm` (temporary) |
| `src/lib/tjm/llm-analyzer.ts` | `../types/tjm` | `../core/types/tjm` (temporary) |
| `src/lib/connectors/base.connector.ts` | `../types/connector` | `../core/types/connector` (temporary) |
| `src/lib/connectors/base.connector.ts` | `../types/mission` | `../core/types/mission` (temporary) |
| `src/lib/connectors/freework.connector.ts` | `../types/mission` | `../core/types/mission` (temporary) |
| `src/lib/connectors/malt.connector.ts` | `../types/mission` | `../core/types/mission` (temporary) |
| `src/lib/connectors/index.ts` | `../types/connector` | `../core/types/connector` (temporary) |
| `src/lib/storage/db.ts` | `../types/mission` | `../core/types/mission` (temporary) |
| `src/lib/storage/db.ts` | `../types/tjm` | `../core/types/tjm` (temporary) |
| `src/lib/storage/db.ts` | `../types/profile` | `../core/types/profile` (temporary) |
| `src/lib/messaging/bridge.ts` | `../types/mission` | `../core/types/mission` (temporary) |
| `src/lib/messaging/bridge.ts` | `../types/tjm` | `../core/types/tjm` (temporary) |
| `src/lib/messaging/bridge.ts` | `../types/profile` | `../core/types/profile` (temporary) |
| Svelte molecules/organisms/pages | `$lib/types/*` | `$lib/core/types/*` |

Update all test files:

| File | Old import path | New import path |
|------|----------------|-----------------|
| `tests/unit/scoring/relevance.test.ts` | `../../../src/lib/types/mission` | `../../../src/lib/core/types/mission` |
| `tests/unit/scoring/relevance.test.ts` | `../../../src/lib/types/profile` | `../../../src/lib/core/types/profile` |
| `tests/unit/tjm/aggregator.test.ts` | `../../../src/lib/types/tjm` | `../../../src/lib/core/types/tjm` |

**Step 4: Run tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add -A && git commit -m "refactor: move types into core/types/"
```

---

## Task 3: Move scoring into core/

**Files:**
- Create: `src/lib/core/scoring/relevance.ts` (moved)
- Create: `src/lib/core/scoring/dedup.ts` (moved)
- Delete: `src/lib/scoring/`

**Step 1: Move files**

```bash
mkdir -p src/lib/core/scoring
mv src/lib/scoring/relevance.ts src/lib/core/scoring/relevance.ts
mv src/lib/scoring/dedup.ts src/lib/core/scoring/dedup.ts
rmdir src/lib/scoring
```

**Step 2: Fix imports inside moved files**

In `src/lib/core/scoring/relevance.ts`:
```typescript
// OLD
import type { Mission } from '../core/types/mission';
import type { UserProfile } from '../core/types/profile';
// NEW
import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';
```

In `src/lib/core/scoring/dedup.ts`:
```typescript
// OLD
import type { Mission } from '../core/types/mission';
// NEW
import type { Mission } from '../types/mission';
```

**Step 3: Update external imports**

| File | Old | New |
|------|-----|-----|
| `src/background/index.ts` | `../lib/scoring/relevance` | `../lib/core/scoring/relevance` |
| `src/background/index.ts` | `../lib/scoring/dedup` | `../lib/core/scoring/dedup` |
| `tests/unit/scoring/relevance.test.ts` | `../../../src/lib/scoring/relevance` | `../../../src/lib/core/scoring/relevance` |

**Step 4: Run tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add -A && git commit -m "refactor: move scoring into core/scoring/"
```

---

## Task 4: Purify aggregator and move to core/

**Files:**
- Create: `src/lib/core/tjm/aggregator.ts` (purified from `src/lib/tjm/aggregator.ts`)
- Modify: `tests/unit/tjm/aggregator.test.ts`
- Delete: `src/lib/tjm/aggregator.ts` (after move)

**Step 1: Update tests to inject `now`**

In `tests/unit/tjm/aggregator.test.ts`, update import and all calls:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateFromPoints } from '../../../src/lib/core/tjm/aggregator';
import type { TJMDataPoint } from '../../../src/lib/core/types/tjm';

const NOW = new Date('2026-03-11T12:00:00Z');

function makePoint(overrides: Partial<TJMDataPoint> = {}): TJMDataPoint {
  return {
    tjm: 500,
    title: 'Développeur React',
    location: 'Paris',
    source: 'free-work',
    date: new Date('2026-03-10T12:00:00Z'), // 1 day before NOW
    ...overrides,
  };
}

describe('aggregateFromPoints', () => {
  it('aggregates matching data points', () => {
    const points: TJMDataPoint[] = [
      makePoint({ tjm: 400 }),
      makePoint({ tjm: 500 }),
      makePoint({ tjm: 600 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris', NOW);
    expect(result).not.toBeNull();
    expect(result!.min).toBe(400);
    expect(result!.max).toBe(600);
    expect(result!.median).toBe(500);
    expect(result!.count).toBe(3);
  });

  it('returns null when no points match', () => {
    const points: TJMDataPoint[] = [
      makePoint({ title: 'Java Developer' }),
    ];
    const result = aggregateFromPoints(points, 'Angular', 'Paris', NOW);
    expect(result).toBeNull();
  });

  it('filters out old data points (> 30 days)', () => {
    const old = new Date('2026-02-01T12:00:00Z'); // > 30 days before NOW
    const points: TJMDataPoint[] = [
      makePoint({ date: old }),
      makePoint({ tjm: 550 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris', NOW);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(1);
    expect(result!.median).toBe(550);
  });

  it('computes correct median for even number of points', () => {
    const points: TJMDataPoint[] = [
      makePoint({ tjm: 400 }),
      makePoint({ tjm: 500 }),
      makePoint({ tjm: 600 }),
      makePoint({ tjm: 700 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris', NOW);
    expect(result!.median).toBe(550);
  });

  it('computes stddev', () => {
    const points: TJMDataPoint[] = [
      makePoint({ tjm: 500 }),
      makePoint({ tjm: 500 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris', NOW);
    expect(result!.stddev).toBe(0);
  });

  it('filters by location', () => {
    const points: TJMDataPoint[] = [
      makePoint({ location: 'Paris', tjm: 600 }),
      makePoint({ location: 'Lyon', tjm: 400 }),
    ];
    const result = aggregateFromPoints(points, 'React', 'Paris', NOW);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(1);
    expect(result!.min).toBe(600);
  });
});
```

**Step 2: Run tests — verify they fail (file not found)**

```bash
pnpm test -- tests/unit/tjm/aggregator.test.ts
```

Expected: FAIL — module not found at new path.

**Step 3: Create purified `core/tjm/aggregator.ts`**

```typescript
import type { TJMDataPoint } from '../types/tjm';

export interface AggregatedTJM {
  title: string;
  location: string | null;
  min: number;
  median: number;
  max: number;
  count: number;
  stddev: number;
  dataPoints: TJMDataPoint[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

export function aggregateFromPoints(
  points: TJMDataPoint[],
  title: string,
  location: string | null,
  now: Date,
): AggregatedTJM | null {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const normalizedTitle = normalizeTitle(title);

  const filtered = points.filter(p => {
    const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
    if (pointDate < thirtyDaysAgo) return false;
    if (!normalizeTitle(p.title).includes(normalizedTitle) && !normalizedTitle.includes(normalizeTitle(p.title))) return false;
    if (location && p.location && !p.location.toLowerCase().includes(location.toLowerCase())) return false;
    return true;
  });

  if (filtered.length === 0) return null;

  const tjms = filtered.map(p => p.tjm);

  return {
    title,
    location,
    min: Math.min(...tjms),
    median: median(tjms),
    max: Math.max(...tjms),
    count: filtered.length,
    stddev: Math.round(stddev(tjms)),
    dataPoints: filtered,
  };
}
```

**Step 4: Delete old aggregator**

```bash
rm src/lib/tjm/aggregator.ts
```

**Step 5: Run tests — verify they pass**

```bash
pnpm test -- tests/unit/tjm/aggregator.test.ts
```

Expected: All 6 tests pass.

**Step 6: Commit**

```bash
git add -A && git commit -m "refactor: purify aggregator (inject now, remove I/O) and move to core/tjm/"
```

---

## Task 5: Purify freework parser and move to core/

**Files:**
- Create: `src/lib/core/connectors/freework-parser.ts` (extracted pure parser)
- Modify: `tests/unit/connectors/freework.test.ts`

**Step 1: Update tests for pure parser with injection**

In `tests/unit/connectors/freework.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFreeWorkHTML } from '../../../src/lib/core/connectors/freework-parser';

const NOW = new Date('2026-03-11T12:00:00Z');
const ID_PREFIX = 'fw-test';

const FIXTURE_HTML = `
<html><body>
<article class="mission">
  <h2><a href="/fr/tech-it/jobs/dev-react-senior-12345">Développeur React Senior</a></h2>
  <span class="company-name">Société ABC</span>
  <div class="tag">React</div>
  <div class="tag">TypeScript</div>
  <div class="tag">Node.js</div>
  <span class="daily-rate">550€/jour</span>
  <span class="location">Paris</span>
  <span class="duration">6 mois</span>
  <p class="description">Mission React/TypeScript pour un grand compte bancaire. Télétravail complet.</p>
</article>
<article class="mission">
  <h2><a href="/fr/tech-it/jobs/dev-java-67890">Développeur Java Spring</a></h2>
  <span class="company-name">Entreprise XYZ</span>
  <div class="tag">Java</div>
  <div class="tag">Spring Boot</div>
  <span class="daily-rate">500€/jour</span>
  <span class="location">Lyon</span>
  <span class="duration">3 mois</span>
  <p class="description">Mission Java hybride sur site à Lyon.</p>
</article>
</body></html>
`;

describe('parseFreeWorkHTML', () => {
  it('parses mission cards from HTML', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'free-work',
      title: 'Développeur React Senior',
      client: 'Société ABC',
      url: expect.stringContaining('free-work.com'),
      id: 'fw-test-0',
      scrapedAt: NOW,
    });
  });

  it('extracts stack tags', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].stack).toEqual(['React', 'TypeScript', 'Node.js']);
  });

  it('extracts TJM as number', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].tjm).toBe(550);
    expect(missions[1].tjm).toBe(500);
  });

  it('extracts location', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].location).toBe('Paris');
    expect(missions[1].location).toBe('Lyon');
  });

  it('detects remote type from text', () => {
    const missions = parseFreeWorkHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].remote).toBe('full');
    expect(missions[1].remote).toBe('hybrid');
  });

  it('returns empty array for empty HTML', () => {
    expect(parseFreeWorkHTML('', NOW, ID_PREFIX)).toEqual([]);
  });

  it('returns empty array for HTML with no mission cards', () => {
    expect(parseFreeWorkHTML('<html><body><p>No results</p></body></html>', NOW, ID_PREFIX)).toEqual([]);
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
pnpm test -- tests/unit/connectors/freework.test.ts
```

Expected: FAIL — module not found.

**Step 3: Create `src/lib/core/connectors/freework-parser.ts`**

```typescript
import type { Mission, MissionSource } from '../types/mission';

const SOURCE: MissionSource = 'free-work';
const BASE_URL = 'https://www.free-work.com';

export function parseFreeWorkHTML(html: string, now: Date, idPrefix: string): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  const cards = doc.querySelectorAll('[data-cy="job-card"], .job-card, article.mission, .search-result-item');

  cards.forEach((card, index) => {
    const titleEl = card.querySelector('h2 a, h3 a, .job-title a, a[data-cy="job-title"]');
    const title = titleEl?.textContent?.trim() ?? '';
    const href = titleEl?.getAttribute('href') ?? '';
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    if (!title) return;

    const clientEl = card.querySelector('.company-name, [data-cy="company-name"], .client');
    const client = clientEl?.textContent?.trim() ?? null;

    const stackEls = card.querySelectorAll('.tag, .skill-tag, [data-cy="skill-tag"], .badge');
    const stack = Array.from(stackEls).map(el => el.textContent?.trim() ?? '').filter(Boolean);

    const tjmEl = card.querySelector('.tjm, .daily-rate, [data-cy="daily-rate"]');
    const tjmText = tjmEl?.textContent?.trim() ?? '';
    const tjmMatch = tjmText.match(/(\d+)/);
    const tjm = tjmMatch ? parseInt(tjmMatch[1], 10) : null;

    const locationEl = card.querySelector('.location, [data-cy="location"], .city');
    const location = locationEl?.textContent?.trim() ?? null;

    const durationEl = card.querySelector('.duration, [data-cy="duration"]');
    const duration = durationEl?.textContent?.trim() ?? null;

    const descEl = card.querySelector('.description, .job-description, p');
    const description = descEl?.textContent?.trim() ?? '';

    const fullText = card.textContent?.toLowerCase() ?? '';
    const remote = fullText.includes('full remote') || fullText.includes('télétravail complet')
      ? 'full' as const
      : fullText.includes('hybride') || fullText.includes('hybrid')
      ? 'hybrid' as const
      : fullText.includes('sur site') || fullText.includes('on-site') || fullText.includes('onsite')
      ? 'onsite' as const
      : null;

    missions.push({
      id: `${idPrefix}-${index}`,
      title,
      client,
      description,
      stack,
      tjm,
      location,
      remote,
      duration,
      url,
      source: SOURCE,
      scrapedAt: now,
      score: null,
    });
  });

  return missions;
}
```

**Step 4: Run tests — verify they pass**

```bash
pnpm test -- tests/unit/connectors/freework.test.ts
```

Expected: All 7 tests pass.

**Step 5: Commit**

```bash
git add -A && git commit -m "refactor: extract pure freework parser into core/connectors/"
```

---

## Task 6: Create shell/ directory and move I/O modules

**Files:**
- Move: `src/lib/storage/` → `src/lib/shell/storage/`
- Move: `src/lib/messaging/` → `src/lib/shell/messaging/`
- Move: `src/lib/tjm/cache.ts` → `src/lib/shell/storage/tjm-cache.ts`
- Move: `src/lib/connectors/` → `src/lib/shell/connectors/`
- Delete: `src/lib/tjm/` (remaining files moved/deleted)

**Step 1: Create shell directories and move files**

```bash
mkdir -p src/lib/shell/storage
mkdir -p src/lib/shell/messaging
mkdir -p src/lib/shell/connectors

mv src/lib/storage/db.ts src/lib/shell/storage/db.ts
mv src/lib/storage/chrome-storage.ts src/lib/shell/storage/chrome-storage.ts
mv src/lib/tjm/cache.ts src/lib/shell/storage/tjm-cache.ts
mv src/lib/messaging/bridge.ts src/lib/shell/messaging/bridge.ts
mv src/lib/connectors/base.connector.ts src/lib/shell/connectors/base.connector.ts
mv src/lib/connectors/freework.connector.ts src/lib/shell/connectors/freework.connector.ts
mv src/lib/connectors/malt.connector.ts src/lib/shell/connectors/malt.connector.ts
mv src/lib/connectors/index.ts src/lib/shell/connectors/index.ts

rm src/lib/tjm/llm-analyzer.ts
rmdir src/lib/tjm
rmdir src/lib/storage
rmdir src/lib/messaging
rmdir src/lib/connectors
```

**Step 2: Fix imports inside shell files**

`src/lib/shell/storage/db.ts` — update type imports:
```typescript
// OLD
import type { Mission } from '../core/types/mission';
import type { TJMDataPoint } from '../core/types/tjm';
import type { UserProfile } from '../core/types/profile';
// NEW
import type { Mission } from '../../core/types/mission';
import type { TJMDataPoint } from '../../core/types/tjm';
import type { UserProfile } from '../../core/types/profile';
```

`src/lib/shell/storage/chrome-storage.ts` — no type imports, no changes needed.

`src/lib/shell/storage/tjm-cache.ts` — update type import:
```typescript
// OLD
import type { TJMAnalysis } from '../types/tjm';
// NEW
import type { TJMAnalysis } from '../../core/types/tjm';
```

`src/lib/shell/messaging/bridge.ts` — update type imports:
```typescript
// OLD
import type { Mission } from '../core/types/mission';
import type { TJMAnalysis } from '../core/types/tjm';
import type { UserProfile } from '../core/types/profile';
import type { SeniorityLevel } from '../core/types/tjm';
// NEW
import type { Mission } from '../../core/types/mission';
import type { TJMAnalysis, SeniorityLevel } from '../../core/types/tjm';
import type { UserProfile } from '../../core/types/profile';
```

`src/lib/shell/connectors/base.connector.ts` — update type imports:
```typescript
// OLD
import type { PlatformConnector } from '../core/types/connector';
import type { Mission } from '../core/types/mission';
// NEW
import type { PlatformConnector } from '../../core/types/connector';
import type { Mission } from '../../core/types/mission';
```

`src/lib/shell/connectors/freework.connector.ts` — update imports:
```typescript
// OLD
import { BaseConnector } from './base.connector';
import type { Mission, MissionSource } from '../types/mission';
import { sendMessage } from '../messaging/bridge';
// NEW
import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseFreeWorkHTML } from '../../core/connectors/freework-parser';
import { sendMessage } from '../messaging/bridge';
```

Also update `fetchMissions()` to use the pure parser with injection:
```typescript
async fetchMissions(): Promise<Mission[]> {
  const response = await sendMessage({
    type: 'SCRAPE_URL',
    payload: { url: MISSIONS_URL, connectorId: this.id },
  });

  if (response.type === 'SCRAPE_RESULT' && 'html' in response.payload) {
    const now = new Date();
    const idPrefix = `fw-${now.getTime()}`;
    const missions = parseFreeWorkHTML((response.payload as { html: string }).html, now, idPrefix);
    await this.setLastSync();
    return missions;
  }

  return [];
}
```

`src/lib/shell/connectors/malt.connector.ts`:
```typescript
// OLD
import type { Mission } from '../types/mission';
// NEW
import type { Mission } from '../../core/types/mission';
```

`src/lib/shell/connectors/index.ts`:
```typescript
// OLD
import type { PlatformConnector } from '../types/connector';
// NEW
import type { PlatformConnector } from '../../core/types/connector';
```

**Step 3: Update external imports**

`src/background/index.ts`:
```typescript
// OLD
import { getProfile, saveProfile, getMissions, saveMissions } from '../lib/storage/db';
import { getSettings } from '../lib/storage/chrome-storage';
import { getConnector } from '../lib/connectors/index';
import { scoreMission } from '../lib/scoring/relevance';
import { deduplicateMissions } from '../lib/scoring/dedup';
import type { BridgeMessage } from '../lib/messaging/bridge';
import type { UserProfile } from '../lib/types/profile';
// NEW
import { getProfile, saveProfile, getMissions, saveMissions } from '../lib/shell/storage/db';
import { getSettings } from '../lib/shell/storage/chrome-storage';
import { getConnector } from '../lib/shell/connectors/index';
import { scoreMission } from '../lib/core/scoring/relevance';
import { deduplicateMissions } from '../lib/core/scoring/dedup';
import type { BridgeMessage } from '../lib/shell/messaging/bridge';
import type { UserProfile } from '../lib/core/types/profile';
```

Svelte pages using `$lib/messaging/bridge`:
```typescript
// OLD
import { sendMessage } from '$lib/messaging/bridge';
// NEW
import { sendMessage } from '$lib/shell/messaging/bridge';
```

Files: `src/ui/pages/FeedPage.svelte`, `src/ui/pages/OnboardingPage.svelte`

**Step 4: Run tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 5: Run build**

```bash
pnpm build
```

Expected: Build succeeds.

**Step 6: Commit**

```bash
git add -A && git commit -m "refactor: move I/O modules into shell/ (storage, messaging, connectors)"
```

---

## Task 7: Create analyze-tjm use case

**Files:**
- Create: `src/lib/shell/usecases/analyze-tjm.ts`

**Step 1: Create the use case**

```typescript
import type { TJMAnalysis, SeniorityLevel } from '../../core/types/tjm';
import { aggregateFromPoints } from '../../core/tjm/aggregator';
import { getTJMDataPoints } from '../storage/db';
import { getApiKey } from '../storage/chrome-storage';
import { getCachedAnalysis, cacheAnalysis } from '../storage/tjm-cache';

export interface AnalyzeTJMInput {
  title: string;
  location: string;
  seniority: SeniorityLevel;
}

export async function analyzeTJM(input: AnalyzeTJMInput): Promise<TJMAnalysis> {
  const { title, location, seniority } = input;

  // 1. Check cache
  const cached = await getCachedAnalysis(title, location, seniority);
  if (cached) return cached;

  // 2. Aggregate from storage
  const allPoints = await getTJMDataPoints();
  const now = new Date();
  const aggregatedData = aggregateFromPoints(allPoints, title, location, now);

  if (!aggregatedData || aggregatedData.count === 0) {
    throw new Error('Pas assez de données pour analyser le TJM.');
  }

  // 3. Call LLM
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Clé API Anthropic non configurée. Ajoutez-la dans les paramètres.');
  }

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
        content: `Analyse l'évolution des taux journaliers moyens (TJM) pour "${title}" dans la zone "${location}" pour le niveau "${seniority}".

Données collectées localement (${aggregatedData.count} missions) :
${JSON.stringify({
  min: aggregatedData.min,
  median: aggregatedData.median,
  max: aggregatedData.max,
  count: aggregatedData.count,
  stddev: aggregatedData.stddev,
})}

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

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Erreur API Anthropic (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const textContent = data.content.find(c => c.type === 'text');
  if (!textContent) {
    throw new Error('Réponse API vide');
  }

  const parsed = JSON.parse(textContent.text) as Omit<TJMAnalysis, 'analyzedAt'>;

  const analysis: TJMAnalysis = {
    ...parsed,
    analyzedAt: now,
  };

  // 4. Cache result
  await cacheAnalysis(title, location, seniority, analysis);

  return analysis;
}
```

**Step 2: Run build to verify compilation**

```bash
pnpm build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(shell): add analyze-tjm use case orchestrating cache, aggregation, and LLM"
```

---

## Task 8: Clean up old files and verify

**Files:**
- Delete: any remaining empty directories under `src/lib/` (types, scoring, tjm, connectors, storage, messaging)
- Verify: no file in `src/lib/core/` imports from `src/lib/shell/`

**Step 1: Clean up empty directories**

```bash
find src/lib -maxdepth 1 -type d -empty -delete
```

**Step 2: Verify Core purity — no shell imports in core/**

```bash
grep -r "shell/" src/lib/core/ || echo "PASS: core/ has no shell imports"
```

Expected: `PASS: core/ has no shell imports`

**Step 3: Verify no remaining old imports**

```bash
grep -rn "from.*['\"].*lib/types/" src/ --include="*.ts" --include="*.svelte" || echo "PASS: no old lib/types imports"
grep -rn "from.*['\"].*lib/scoring/" src/ --include="*.ts" --include="*.svelte" || echo "PASS: no old lib/scoring imports"
grep -rn "from.*['\"].*lib/storage/" src/ --include="*.ts" --include="*.svelte" || echo "PASS: no old lib/storage imports"
grep -rn "from.*['\"].*lib/messaging/" src/ --include="*.ts" --include="*.svelte" || echo "PASS: no old lib/messaging imports"
grep -rn "from.*['\"].*lib/connectors/" src/ --include="*.ts" --include="*.svelte" || echo "PASS: no old lib/connectors imports"
grep -rn "from.*['\"].*lib/tjm/" src/ --include="*.ts" --include="*.svelte" || echo "PASS: no old lib/tjm imports"
```

Expected: All PASS.

**Step 4: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 5: Run build**

```bash
pnpm build
```

Expected: Build succeeds.

**Step 6: Commit**

```bash
git add -A && git commit -m "refactor: clean up old directories, verify core/shell separation"
```

---

## Summary

| Task | Description | Key Change |
|------|-------------|------------|
| 1 | Migrate to pnpm | `package-lock.json` → `pnpm-lock.yaml` |
| 2 | Move types to `core/types/` | All type files moved, all imports updated |
| 3 | Move scoring to `core/scoring/` | Already pure, just move |
| 4 | Purify aggregator → `core/tjm/` | Inject `now: Date`, remove I/O import |
| 5 | Purify freework parser → `core/connectors/` | Inject `now`, `idPrefix` |
| 6 | Move I/O to `shell/` | storage, messaging, connectors moved |
| 7 | Create analyze-tjm use case | Replaces `llm-analyzer.ts` with proper orchestration |
| 8 | Clean up and verify | No shell imports in core, all tests pass |
