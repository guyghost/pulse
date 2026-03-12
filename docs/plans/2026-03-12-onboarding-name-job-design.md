# Onboarding: firstName + jobTitle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add firstName field to onboarding, rename profile.title to jobTitle, display greeting in feed header.

**Architecture:** Enrich the existing single-screen onboarding form. No structural changes to XState machine. Profile type gets two changes: add `firstName`, rename `title` -> `jobTitle`. Feed header shows "Bonjour, {firstName}".

**Tech Stack:** Svelte 5 (runes), XState 5, TypeScript strict, Vitest, Playwright

---

### Task 1: Update UserProfile type + fix all references

**Files:**
- Modify: `src/lib/core/types/profile.ts:4-12`
- Modify: `src/dev/mocks.ts:6-13`
- Modify: `tests/unit/scoring/relevance.test.ts:6-14`
- Modify: `tests/unit/machines/onboarding.test.ts:55-71`

**Step 1: Update the UserProfile type**

In `src/lib/core/types/profile.ts`, add `firstName` and rename `title` to `jobTitle`:

```typescript
export interface UserProfile {
  firstName: string;
  stack: string[];
  tjmMin: number;
  tjmMax: number;
  location: string;
  remote: RemoteType | 'any';
  seniority: SeniorityLevel;
  jobTitle: string;
}
```

**Step 2: Update mockProfile in `src/dev/mocks.ts`**

Change `title: 'Developpeur Fullstack'` to `jobTitle: 'Developpeur Fullstack'` and add `firstName: 'Alice'`.

```typescript
export const mockProfile: UserProfile = {
  firstName: 'Alice',
  stack: ['TypeScript', 'React', 'Node.js', 'Svelte'],
  tjmMin: 500,
  tjmMax: 750,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Developpeur Fullstack',
};
```

**Step 3: Update relevance test profile**

In `tests/unit/scoring/relevance.test.ts`, change the profile literal:

```typescript
const profile: UserProfile = {
  firstName: 'Test',
  stack: ['TypeScript', 'React', 'Node.js'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Developpeur Fullstack',
};
```

**Step 4: Update onboarding machine test**

In `tests/unit/machines/onboarding.test.ts`, replace `title: 'Dev React'` with `jobTitle: 'Dev React'` in SET_PROFILE events and assertions (lines 55, 58, 67, 71).

**Step 5: Run tests to verify rename is consistent**

Run: `pnpm test`
Expected: All 14 test files pass (81 tests)

**Step 6: Commit**

```bash
git add src/lib/core/types/profile.ts src/dev/mocks.ts tests/unit/scoring/relevance.test.ts tests/unit/machines/onboarding.test.ts
git commit -m "refactor: rename profile.title to jobTitle, add firstName to UserProfile"
```

---

### Task 2: Update OnboardingWizard with firstName field + jobTitle label

**Files:**
- Modify: `src/ui/organisms/OnboardingWizard.svelte`

**Step 1: Add firstName state and update labels**

In `OnboardingWizard.svelte`:
- Add `let firstName = $state('');` alongside existing state
- Rename local `title` variable to `jobTitle` for clarity
- Update `canSubmit` to require both `firstName` AND `jobTitle` non-empty
- Update `handleComplete` to include `firstName` in the profile payload
- Add new input field for "Prenom" before the "Poste recherche" field
- Rename label from "Titre / Poste" to "Poste recherche"
- Change placeholder to "ex: Developpeur React Senior"
- Change input id from `ob-title` to `ob-jobtitle`

Full updated component:

```svelte
<script lang="ts">
  import type { UserProfile } from '$lib/core/types/profile';
  import Chip from '../atoms/Chip.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { ripple } from '../actions/ripple';

  let {
    onComplete,
    onUpdateProfile,
  }: {
    onComplete?: () => void;
    onUpdateProfile?: (profile: Partial<UserProfile>) => void;
  } = $props();

  let firstName = $state('');
  let jobTitle = $state('');
  let stack = $state<string[]>([]);
  let stackInput = $state('');
  let tjm = $state(600);

  function addStack() {
    const trimmed = stackInput.trim();
    if (trimmed && !stack.includes(trimmed)) {
      stack = [...stack, trimmed];
      stackInput = '';
      onUpdateProfile?.({ stack });
    }
  }

  function removeStack(item: string) {
    stack = stack.filter(s => s !== item);
    onUpdateProfile?.({ stack });
  }

  function handleComplete() {
    onUpdateProfile?.({ firstName, jobTitle, stack, tjmMin: tjm, tjmMax: tjm + 150 });
    onComplete?.();
  }

  let canSubmit = $derived(firstName.trim().length > 0 && jobTitle.trim().length > 0);
</script>

<div class="space-y-5">
  <div>
    <label for="ob-firstname" class="block text-xs text-text-secondary mb-1.5">Prenom</label>
    <input
      id="ob-firstname"
      type="text"
      class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
      placeholder="ex: Guy"
      bind:value={firstName}
    />
  </div>

  <div>
    <label for="ob-jobtitle" class="block text-xs text-text-secondary mb-1.5">Poste recherche</label>
    <input
      id="ob-jobtitle"
      type="text"
      class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
      placeholder="ex: Developpeur React Senior"
      bind:value={jobTitle}
    />
  </div>

  <!-- stack and tjm fields remain unchanged -->
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/ui/organisms/OnboardingWizard.svelte
git commit -m "feat: add firstName field to onboarding, rename title to jobTitle"
```

---

### Task 3: Add greeting to FeedPage header

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte:9,131-134`

**Step 1: Load profile and display greeting**

In `FeedPage.svelte`:
- Import `getProfile` from `$lib/shell/storage/db` (or use `sendMessage` with `GET_PROFILE`)
- Add state: `let firstName = $state('');`
- Add effect to load profile on mount and extract firstName
- Replace `<h2>Missions</h2>` with `<h2>{firstName ? 'Bonjour, ' + firstName : 'Missions'}</h2>`

Add import:
```typescript
import { getProfile } from '$lib/shell/storage/db';
```

Add state + effect after existing state declarations:
```typescript
let firstName = $state('');

$effect(() => {
  getProfile().then(p => { if (p?.firstName) firstName = p.firstName; }).catch(() => {});
});
```

Update the header h2 (line ~134):
```svelte
<h2 class="text-sm font-semibold text-white">{firstName ? `Bonjour, ${firstName}` : 'Missions'}</h2>
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/ui/pages/FeedPage.svelte
git commit -m "feat: display greeting with firstName in feed header"
```

---

### Task 4: Update E2E tests

**Files:**
- Modify: `tests/e2e/onboarding.test.ts`

**Step 1: Update existing E2E tests**

The E2E tests need to:
- Fill `#ob-firstname` before `#ob-jobtitle`
- Update the selector from `#ob-title` to `#ob-jobtitle`
- Verify button is disabled without firstName
- Verify "Bonjour, {firstName}" appears after onboarding

```typescript
import { test, expect } from '@playwright/test';
import { SIDE_PANEL } from './helpers';

async function withNoProfile(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let _chrome: any = undefined;
    Object.defineProperty(window, 'chrome', {
      configurable: true, enumerable: true,
      get() { return _chrome; },
      set(val) {
        _chrome = val;
        if (val?.runtime?.sendMessage) {
          const origSend = val.runtime.sendMessage;
          val.runtime.sendMessage = async (msg: any) => {
            if (msg?.type === 'GET_PROFILE') return { type: 'PROFILE_RESULT', payload: null };
            return origSend.call(val.runtime, msg);
          };
        }
      },
    });
  });
}

test.describe('Onboarding', () => {
  test('single-screen onboarding completes and shows greeting', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.getByText('Configurez en 30 secondes')).toBeVisible();
    await page.locator('#ob-firstname').fill('Guy');
    await page.locator('#ob-jobtitle').fill('Dev React Senior');
    await page.getByRole('button', { name: /C.est parti/ }).click();

    await expect(page.getByText('Bonjour, Guy')).toBeVisible();
  });

  test('submit button disabled without firstName', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await page.locator('#ob-jobtitle').fill('Dev React');
    await expect(page.getByRole('button', { name: /C.est parti/ })).toBeDisabled();
  });

  test('submit button disabled without jobTitle', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await page.locator('#ob-firstname').fill('Guy');
    await expect(page.getByRole('button', { name: /C.est parti/ })).toBeDisabled();
  });

  test('auto-skips onboarding when profile exists (default stubs)', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText(/Bonjour|Missions/)).toBeVisible();
  });
});
```

**Step 2: Run E2E tests**

Run: `pnpm test:e2e`
Expected: All 4 tests pass

**Step 3: Commit**

```bash
git add tests/e2e/onboarding.test.ts
git commit -m "test: update E2E tests for firstName + jobTitle onboarding"
```
