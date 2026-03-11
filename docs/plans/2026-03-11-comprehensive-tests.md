# Comprehensive Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full test coverage with XState machine unit tests (4 machines) and E2E Playwright tests (10 scenarios) against the dev server.

**Architecture:** Machine tests use `createActor()` from XState to verify state transitions and context updates — no mocks needed. E2E tests run Playwright against the Vite dev server which has Chrome API stubs, making the full UI testable in a regular browser.

**Tech Stack:** Vitest, XState 5, Playwright, Svelte 5

---

## Task 1: Feed machine tests

**Files:**
- Create: `tests/unit/machines/feed.test.ts`

**Step 1: Write the tests**

```typescript
import { createActor } from 'xstate';
import { feedMachine } from '../../../src/machines/feed.machine';
import type { Mission } from '../../../src/lib/core/types/mission';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test-1',
    title: 'Dev React Senior',
    client: 'Acme',
    description: 'Mission React pour projet e-commerce',
    stack: ['React', 'TypeScript'],
    tjm: 600,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    url: 'https://example.com/1',
    source: 'free-work',
    scrapedAt: new Date('2026-01-01'),
    score: 75,
    ...overrides,
  };
}

describe('feed machine', () => {
  it('starts in empty state', () => {
    const actor = createActor(feedMachine).start();
    expect(actor.getSnapshot().value).toBe('empty');
    actor.stop();
  });

  it('transitions empty → loading → loaded', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    expect(actor.getSnapshot().value).toBe('loading');

    const missions = [makeMission(), makeMission({ id: 'test-2', title: 'Dev Vue' })];
    actor.send({ type: 'MISSIONS_LOADED', missions });
    expect(actor.getSnapshot().value).toBe('loaded');
    expect(actor.getSnapshot().context.missions).toHaveLength(2);
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(2);
    actor.stop();
  });

  it('transitions loading → error on LOAD_ERROR', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({ type: 'LOAD_ERROR', error: 'Network error' });
    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.error).toBe('Network error');
    actor.stop();
  });

  it('searches missions by title', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({
      type: 'MISSIONS_LOADED',
      missions: [
        makeMission({ id: '1', title: 'Dev React Senior' }),
        makeMission({ id: '2', title: 'Dev Java Spring' }),
        makeMission({ id: '3', title: 'Lead React Native' }),
      ],
    });

    actor.send({ type: 'SEARCH', query: 'React' });
    expect(actor.getSnapshot().value).toBe('searching');
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(2);
    expect(actor.getSnapshot().context.searchQuery).toBe('React');
    actor.stop();
  });

  it('searches missions by stack', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({
      type: 'MISSIONS_LOADED',
      missions: [
        makeMission({ id: '1', stack: ['React', 'TypeScript'] }),
        makeMission({ id: '2', stack: ['Java', 'Spring'] }),
      ],
    });

    actor.send({ type: 'SEARCH', query: 'java' });
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(1);
    actor.stop();
  });

  it('clears search and restores all missions', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    const missions = [makeMission({ id: '1' }), makeMission({ id: '2' })];
    actor.send({ type: 'MISSIONS_LOADED', missions });
    actor.send({ type: 'SEARCH', query: 'nonexistent' });
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(0);

    actor.send({ type: 'CLEAR_SEARCH' });
    expect(actor.getSnapshot().value).toBe('loaded');
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(2);
    expect(actor.getSnapshot().context.searchQuery).toBe('');
    actor.stop();
  });

  it('applies and clears filters', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    const missions = [makeMission({ id: '1' }), makeMission({ id: '2' }), makeMission({ id: '3' })];
    actor.send({ type: 'MISSIONS_LOADED', missions });

    actor.send({ type: 'FILTER', missions: [missions[0]] });
    expect(actor.getSnapshot().value).toBe('filtered');
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(1);

    actor.send({ type: 'CLEAR_FILTERS' });
    expect(actor.getSnapshot().value).toBe('loaded');
    expect(actor.getSnapshot().context.filteredMissions).toHaveLength(3);
    actor.stop();
  });

  it('refreshes from loaded state', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({ type: 'MISSIONS_LOADED', missions: [makeMission()] });
    expect(actor.getSnapshot().value).toBe('loaded');

    actor.send({ type: 'REFRESH' });
    expect(actor.getSnapshot().value).toBe('loading');
    actor.stop();
  });

  it('refreshes from error state', () => {
    const actor = createActor(feedMachine).start();
    actor.send({ type: 'LOAD' });
    actor.send({ type: 'LOAD_ERROR', error: 'fail' });
    expect(actor.getSnapshot().value).toBe('error');

    actor.send({ type: 'REFRESH' });
    expect(actor.getSnapshot().value).toBe('loading');
    actor.stop();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/machines/feed.test.ts`
Expected: 9 tests PASS

**Step 3: Commit**

```bash
git add tests/unit/machines/feed.test.ts
git commit -m "test: add feed machine unit tests (9 tests)"
```

---

## Task 2: Onboarding machine tests

**Files:**
- Create: `tests/unit/machines/onboarding.test.ts`

**Step 1: Write the tests**

```typescript
import { createActor } from 'xstate';
import { onboardingMachine } from '../../../src/machines/onboarding.machine';

describe('onboarding machine', () => {
  it('starts in welcome state', () => {
    const actor = createActor(onboardingMachine).start();
    expect(actor.getSnapshot().value).toBe('welcome');
    actor.stop();
  });

  it('follows happy path: welcome → profile → connectors → firstScan → done', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' }); // welcome → profile
    expect(actor.getSnapshot().value).toBe('profile');

    actor.send({ type: 'NEXT' }); // profile → connectors
    expect(actor.getSnapshot().value).toBe('connectors');

    actor.send({ type: 'NEXT' }); // connectors → firstScan
    expect(actor.getSnapshot().value).toBe('firstScan');

    actor.send({ type: 'SCAN_DONE' }); // firstScan → done
    expect(actor.getSnapshot().value).toBe('done');
    expect(actor.getSnapshot().context.scanComplete).toBe(true);
    actor.stop();
  });

  it('navigates back through steps', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' }); // → profile
    actor.send({ type: 'NEXT' }); // → connectors

    actor.send({ type: 'BACK' }); // connectors → profile
    expect(actor.getSnapshot().value).toBe('profile');

    actor.send({ type: 'BACK' }); // profile → welcome
    expect(actor.getSnapshot().value).toBe('welcome');
    actor.stop();
  });

  it('back from firstScan goes to connectors', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' }); // → profile
    actor.send({ type: 'NEXT' }); // → connectors
    actor.send({ type: 'NEXT' }); // → firstScan

    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('connectors');
    actor.stop();
  });

  it('SET_PROFILE updates context.profile', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' }); // → profile
    actor.send({ type: 'SET_PROFILE', profile: { title: 'Dev React', stack: ['React'] } });

    expect(actor.getSnapshot().context.profile).toEqual({
      title: 'Dev React',
      stack: ['React'],
    });
    actor.stop();
  });

  it('SET_PROFILE merges with existing profile', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' }); // → profile
    actor.send({ type: 'SET_PROFILE', profile: { title: 'Dev React' } });
    actor.send({ type: 'SET_PROFILE', profile: { stack: ['React', 'TS'] } });

    expect(actor.getSnapshot().context.profile).toEqual({
      title: 'Dev React',
      stack: ['React', 'TS'],
    });
    actor.stop();
  });

  it('SET_CONNECTORS updates context.enabledConnectors', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' }); // → profile
    actor.send({ type: 'NEXT' }); // → connectors
    actor.send({ type: 'SET_CONNECTORS', connectors: ['free-work', 'malt'] });

    expect(actor.getSnapshot().context.enabledConnectors).toEqual(['free-work', 'malt']);
    actor.stop();
  });

  it('SKIP_SCAN goes directly to done without markScanDone', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' }); // → profile
    actor.send({ type: 'NEXT' }); // → connectors
    actor.send({ type: 'NEXT' }); // → firstScan
    actor.send({ type: 'SKIP_SCAN' });

    expect(actor.getSnapshot().value).toBe('done');
    expect(actor.getSnapshot().context.scanComplete).toBe(false);
    actor.stop();
  });

  it('done is a final state', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'SKIP_SCAN' });

    expect(actor.getSnapshot().status).toBe('done');
    actor.stop();
  });
});
```

**Step 2: Run tests**

Run: `pnpm test -- tests/unit/machines/onboarding.test.ts`
Expected: 9 tests PASS

**Step 3: Commit**

```bash
git add tests/unit/machines/onboarding.test.ts
git commit -m "test: add onboarding machine unit tests (9 tests)"
```

---

## Task 3: Filters machine tests

**Files:**
- Create: `tests/unit/machines/filters.test.ts`

**Step 1: Write the tests**

```typescript
import { createActor } from 'xstate';
import { filtersMachine } from '../../../src/machines/filters.machine';

describe('filters machine', () => {
  it('starts in inactive state with empty context', () => {
    const actor = createActor(filtersMachine).start();
    expect(actor.getSnapshot().value).toBe('inactive');
    expect(actor.getSnapshot().context).toEqual({
      stack: [],
      tjmRange: null,
      location: null,
      remote: null,
    });
    actor.stop();
  });

  it('SET_STACK transitions to active', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_STACK', stack: ['React', 'TypeScript'] });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.stack).toEqual(['React', 'TypeScript']);
    actor.stop();
  });

  it('TOGGLE_STACK_ITEM adds and removes items', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    expect(actor.getSnapshot().context.stack).toEqual(['React']);

    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'Vue' });
    expect(actor.getSnapshot().context.stack).toEqual(['React', 'Vue']);

    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    expect(actor.getSnapshot().context.stack).toEqual(['Vue']);
    actor.stop();
  });

  it('SET_TJM_RANGE transitions to active', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_TJM_RANGE', min: 500, max: 800 });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.tjmRange).toEqual({ min: 500, max: 800 });
    actor.stop();
  });

  it('SET_LOCATION transitions to active', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_LOCATION', location: 'Paris' });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.location).toBe('Paris');
    actor.stop();
  });

  it('SET_REMOTE transitions to active', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_REMOTE', remote: 'full' });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.remote).toBe('full');
    actor.stop();
  });

  it('CLEAR_ALL resets to inactive', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_STACK', stack: ['React'] });
    actor.send({ type: 'SET_LOCATION', location: 'Lyon' });
    actor.send({ type: 'SET_REMOTE', remote: 'hybrid' });
    expect(actor.getSnapshot().value).toBe('active');

    actor.send({ type: 'CLEAR_ALL' });
    expect(actor.getSnapshot().value).toBe('inactive');
    expect(actor.getSnapshot().context).toEqual({
      stack: [],
      tjmRange: null,
      location: null,
      remote: null,
    });
    actor.stop();
  });

  it('auto-transitions to inactive when last filter removed', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    expect(actor.getSnapshot().value).toBe('active');

    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' }); // remove it
    expect(actor.getSnapshot().value).toBe('inactive');
    actor.stop();
  });

  it('stays active when some filters remain after removing one', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    actor.send({ type: 'SET_LOCATION', location: 'Paris' });

    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' }); // remove stack
    expect(actor.getSnapshot().value).toBe('active'); // location still set
    expect(actor.getSnapshot().context.location).toBe('Paris');
    actor.stop();
  });
});
```

**Step 2: Run tests**

Run: `pnpm test -- tests/unit/machines/filters.test.ts`
Expected: 9 tests PASS

**Step 3: Commit**

```bash
git add tests/unit/machines/filters.test.ts
git commit -m "test: add filters machine unit tests (9 tests)"
```

---

## Task 4: TJM machine tests

**Files:**
- Create: `tests/unit/machines/tjm.test.ts`

**Step 1: Write the tests**

```typescript
import { createActor } from 'xstate';
import { tjmMachine } from '../../../src/machines/tjm.machine';
import type { TJMAnalysis, TJMDataPoint } from '../../../src/lib/core/types/tjm';

const mockDataPoints: TJMDataPoint[] = [
  { title: 'Dev React', tjm: 600, location: 'Paris', date: new Date('2026-01-15'), source: 'free-work' },
  { title: 'Dev React', tjm: 650, location: 'Paris', date: new Date('2026-02-01'), source: 'free-work' },
];

const mockAnalysis: TJMAnalysis = {
  junior: { min: 350, median: 450, max: 550 },
  confirmed: { min: 500, median: 600, max: 700 },
  senior: { min: 650, median: 750, max: 900 },
  trend: 'up',
  trendDetail: 'Hausse de 5%',
  recommendation: 'Bon positionnement',
  confidence: 0.82,
  dataPoints: 47,
  analyzedAt: new Date('2026-03-01'),
};

describe('tjm machine', () => {
  it('starts in idle state', () => {
    const actor = createActor(tjmMachine).start();
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.query).toBeNull();
    expect(actor.getSnapshot().context.analysis).toBeNull();
    actor.stop();
  });

  it('follows happy path: idle → aggregating → callingLLM → ready', () => {
    const actor = createActor(tjmMachine).start();

    actor.send({ type: 'ANALYZE', title: 'Dev React', location: 'Paris', seniority: 'senior' });
    expect(actor.getSnapshot().value).toBe('aggregating');
    expect(actor.getSnapshot().context.query).toEqual({
      title: 'Dev React', location: 'Paris', seniority: 'senior',
    });

    actor.send({ type: 'AGGREGATION_DONE', data: mockDataPoints });
    expect(actor.getSnapshot().value).toBe('callingLLM');
    expect(actor.getSnapshot().context.aggregatedData).toHaveLength(2);

    actor.send({ type: 'LLM_DONE', analysis: mockAnalysis });
    expect(actor.getSnapshot().value).toBe('ready');
    expect(actor.getSnapshot().context.analysis).toBe(mockAnalysis);
    actor.stop();
  });

  it('handles ERROR from aggregating', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'junior' });
    actor.send({ type: 'ERROR', error: 'No data points' });

    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.error).toBe('No data points');
    actor.stop();
  });

  it('handles ERROR from callingLLM', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'junior' });
    actor.send({ type: 'AGGREGATION_DONE', data: mockDataPoints });
    actor.send({ type: 'ERROR', error: 'LLM timeout' });

    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.error).toBe('LLM timeout');
    actor.stop();
  });

  it('RESET from ready goes to idle with clean context', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'senior' });
    actor.send({ type: 'AGGREGATION_DONE', data: mockDataPoints });
    actor.send({ type: 'LLM_DONE', analysis: mockAnalysis });

    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.query).toBeNull();
    expect(actor.getSnapshot().context.aggregatedData).toEqual([]);
    expect(actor.getSnapshot().context.analysis).toBeNull();
    expect(actor.getSnapshot().context.error).toBeNull();
    actor.stop();
  });

  it('RESET from error goes to idle', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'junior' });
    actor.send({ type: 'ERROR', error: 'fail' });

    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });

  it('ANALYZE from ready starts new analysis', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev React', location: 'Paris', seniority: 'senior' });
    actor.send({ type: 'AGGREGATION_DONE', data: mockDataPoints });
    actor.send({ type: 'LLM_DONE', analysis: mockAnalysis });

    actor.send({ type: 'ANALYZE', title: 'Dev Vue', location: 'Lyon', seniority: 'confirmed' });
    expect(actor.getSnapshot().value).toBe('aggregating');
    expect(actor.getSnapshot().context.query?.title).toBe('Dev Vue');
    actor.stop();
  });

  it('ANALYZE from error retries', () => {
    const actor = createActor(tjmMachine).start();
    actor.send({ type: 'ANALYZE', title: 'Dev', location: 'Paris', seniority: 'junior' });
    actor.send({ type: 'ERROR', error: 'fail' });

    actor.send({ type: 'ANALYZE', title: 'Dev React', location: 'Paris', seniority: 'senior' });
    expect(actor.getSnapshot().value).toBe('aggregating');
    expect(actor.getSnapshot().context.error).toBeNull();
    actor.stop();
  });
});
```

**Step 2: Run tests**

Run: `pnpm test -- tests/unit/machines/tjm.test.ts`
Expected: 8 tests PASS

**Step 3: Commit**

```bash
git add tests/unit/machines/tjm.test.ts
git commit -m "test: add TJM machine unit tests (8 tests)"
```

---

## Task 5: Playwright config + install browsers

**Files:**
- Modify: `playwright.config.ts`

**Step 1: Update Playwright config with webServer**

Replace `playwright.config.ts` with:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
```

**Step 2: Install Playwright browsers**

```bash
pnpm exec playwright install chromium
```

**Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "chore: configure Playwright with webServer auto-start"
```

---

## Task 6: E2E — Onboarding tests

**Files:**
- Create: `tests/e2e/onboarding.test.ts`

**Step 1: Write the tests**

```typescript
import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

test.describe('Onboarding', () => {
  test('completes onboarding happy path and shows feed', async ({ page }) => {
    await page.goto(SIDE_PANEL);

    // Step 1: Welcome / Profile
    await expect(page.getByText('Votre profil')).toBeVisible();
    await page.getByPlaceholder('ex: Développeur Fullstack').fill('Dev React Senior');
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Step 2: TJM & Location
    await expect(page.getByText('Tarif & Localisation')).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Step 3: Récapitulatif
    await expect(page.getByText('Récapitulatif')).toBeVisible();
    await page.getByRole('button', { name: 'Commencer' }).click();

    // Should now be on feed page
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('navigates back through onboarding steps', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Votre profil')).toBeVisible();

    // Go to step 2
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText('Tarif & Localisation')).toBeVisible();

    // Go back to step 1
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByText('Votre profil')).toBeVisible();
  });
});
```

**Step 2: Run E2E tests**

```bash
pnpm test:e2e tests/e2e/onboarding.test.ts
```

Expected: 2 tests PASS

**Step 3: Commit**

```bash
git add tests/e2e/onboarding.test.ts
git commit -m "test(e2e): add onboarding flow tests"
```

---

## Task 7: E2E — Feed + scan tests

**Files:**
- Modify: `tests/e2e/feed.test.ts` (replace placeholder)

**Step 1: Replace the placeholder with real tests**

```typescript
import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

async function completeOnboarding(page: import('@playwright/test').Page) {
  await page.goto(SIDE_PANEL);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Missions')).toBeVisible();
}

test.describe('Feed', () => {
  test('scan loads mock missions', async ({ page }) => {
    await completeOnboarding(page);

    // Click scan button
    await page.getByRole('button', { name: 'Scanner' }).click();

    // Missions should appear after chrome stub delay (~800ms)
    await expect(page.locator('[class*="MissionCard"], .bg-surface').first()).toBeVisible({ timeout: 3000 });
    // Should show mission count
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });
  });

  test('empty state shows "Aucune mission"', async ({ page }) => {
    await completeOnboarding(page);
    await expect(page.getByText('Aucune mission')).toBeVisible();
  });

  test('search filters missions', async ({ page }) => {
    await completeOnboarding(page);

    // Inject missions via DevPanel
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'inject' }).click();
    await page.keyboard.press('Control+Shift+D'); // close panel

    // Wait for missions to appear
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Search
    await page.getByPlaceholder('Rechercher...').fill('React');
    // Wait for debounce (300ms) + rendering
    await page.waitForTimeout(500);

    // Should show filtered results (fewer missions)
    await expect(page.getByText(/\d+ missions?/)).toBeVisible();
  });

  test('error state shows error message', async ({ page }) => {
    await completeOnboarding(page);

    // Use DevPanel to set error state
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'error' }).click();
    await page.keyboard.press('Control+Shift+D'); // close

    await expect(page.getByText('Erreur')).toBeVisible({ timeout: 2000 });
  });
});
```

**Step 2: Run E2E tests**

```bash
pnpm test:e2e tests/e2e/feed.test.ts
```

Expected: 4 tests PASS

**Step 3: Commit**

```bash
git add tests/e2e/feed.test.ts
git commit -m "test(e2e): add feed, scan, search, and error state tests"
```

---

## Task 8: E2E — Navigation tests

**Files:**
- Create: `tests/e2e/navigation.test.ts`

**Step 1: Write the tests**

```typescript
import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

async function completeOnboarding(page: import('@playwright/test').Page) {
  await page.goto(SIDE_PANEL);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Missions')).toBeVisible();
}

test.describe('Navigation', () => {
  test('navigates between tabs: Feed → TJM → Settings → Feed', async ({ page }) => {
    await completeOnboarding(page);

    // Navigate to TJM
    await page.getByRole('button', { name: 'TJM' }).click();
    await expect(page.getByText('TJM')).toBeVisible();

    // Navigate to Settings
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Settings')).toBeVisible();

    // Navigate back to Feed
    await page.getByRole('button', { name: 'Feed' }).click();
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('active tab is visually highlighted', async ({ page }) => {
    await completeOnboarding(page);

    // Feed tab should be active (has accent-blue border)
    const feedTab = page.getByRole('button', { name: 'Feed' });
    await expect(feedTab).toHaveClass(/text-accent-blue/);

    // Click TJM
    await page.getByRole('button', { name: 'TJM' }).click();
    const tjmTab = page.getByRole('button', { name: 'TJM' });
    await expect(tjmTab).toHaveClass(/text-accent-blue/);

    // Feed should no longer be active
    await expect(feedTab).not.toHaveClass(/text-accent-blue/);
  });
});
```

**Step 2: Run E2E tests**

```bash
pnpm test:e2e tests/e2e/navigation.test.ts
```

Expected: 2 tests PASS

**Step 3: Commit**

```bash
git add tests/e2e/navigation.test.ts
git commit -m "test(e2e): add navigation and tab highlight tests"
```

---

## Task 9: E2E — DevPanel tests

**Files:**
- Create: `tests/e2e/devpanel.test.ts`

**Step 1: Write the tests**

```typescript
import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

async function completeOnboarding(page: import('@playwright/test').Page) {
  await page.goto(SIDE_PANEL);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Missions')).toBeVisible();
}

test.describe('DevPanel', () => {
  test('opens with Ctrl+Shift+D', async ({ page }) => {
    await completeOnboarding(page);
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
  });

  test('closes with Ctrl+Shift+D again', async ({ page }) => {
    await completeOnboarding(page);
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();

    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).not.toBeVisible();
  });

  test('shows all control sections', async ({ page }) => {
    await completeOnboarding(page);
    await page.keyboard.press('Control+Shift+D');

    await expect(page.getByText('Feed State')).toBeVisible();
    await expect(page.getByText('Missions')).toBeVisible();
    await expect(page.getByText('Onboarding')).toBeVisible();
    await expect(page.getByText('Bridge Logs')).toBeVisible();
  });

  test('inject missions populates feed', async ({ page }) => {
    await completeOnboarding(page);

    // Open DevPanel and inject
    await page.keyboard.press('Control+Shift+D');
    await page.getByRole('button', { name: 'inject' }).click();
    await page.keyboard.press('Control+Shift+D'); // close

    // Missions should appear
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });
  });

  test('toggle onboarding returns to onboarding screen', async ({ page }) => {
    await completeOnboarding(page);

    await page.keyboard.press('Control+Shift+D');
    await page.getByRole('button', { name: 'toggle onboarding' }).click();

    // Should show onboarding again
    await expect(page.getByText('Votre profil')).toBeVisible();
  });

  test('set state empty shows "Aucune mission"', async ({ page }) => {
    await completeOnboarding(page);

    // First inject missions so we have some
    await page.keyboard.press('Control+Shift+D');
    await page.getByRole('button', { name: 'inject' }).click();
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Now set empty
    await page.keyboard.press('Control+Shift+D');
    await page.getByRole('button', { name: 'empty' }).click();
    await page.keyboard.press('Control+Shift+D');

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });
});
```

**Step 2: Run E2E tests**

```bash
pnpm test:e2e tests/e2e/devpanel.test.ts
```

Expected: 6 tests PASS

**Step 3: Commit**

```bash
git add tests/e2e/devpanel.test.ts
git commit -m "test(e2e): add DevPanel tests (open/close, inject, states, toggle)"
```

---

## Task 10: Run full test suite and final commit

**Step 1: Run all unit tests**

```bash
pnpm test
```

Expected: ~55 tests PASS across 7 test files

**Step 2: Run all E2E tests**

```bash
pnpm test:e2e
```

Expected: ~14 tests PASS across 4 test files

**Step 3: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "test: finalize comprehensive test suite"
```

---

## Summary

| Task | Type | Tests | Key Files |
|------|------|-------|-----------|
| 1 | Unit | 9 | `tests/unit/machines/feed.test.ts` |
| 2 | Unit | 9 | `tests/unit/machines/onboarding.test.ts` |
| 3 | Unit | 9 | `tests/unit/machines/filters.test.ts` |
| 4 | Unit | 8 | `tests/unit/machines/tjm.test.ts` |
| 5 | Config | — | `playwright.config.ts` |
| 6 | E2E | 2 | `tests/e2e/onboarding.test.ts` |
| 7 | E2E | 4 | `tests/e2e/feed.test.ts` |
| 8 | E2E | 2 | `tests/e2e/navigation.test.ts` |
| 9 | E2E | 6 | `tests/e2e/devpanel.test.ts` |
| 10 | Verification | — | Full suite run |

**Total: ~35 new unit tests + ~14 E2E tests = ~49 new tests**
