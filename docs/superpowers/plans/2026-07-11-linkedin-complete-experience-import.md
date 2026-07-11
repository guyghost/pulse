# LinkedIn Complete Experience Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import every LinkedIn position from the authenticated profile's dedicated experience page, including positions hidden behind “Tout afficher”, without navigating the user's active tab or merging partial results.

**Architecture:** Keep the side-panel state machine unchanged while extending the service-worker extraction shell with a bounded inactive-tab submachine. A self-contained injected DOM function waits for the complete detail list, returns sanitized `RawExperience` values, and the existing pure canonical parser/merge pipeline persists them. The canonical experience model also gains an optional `employmentType` field so values such as “Freelance” and “CDI” are not folded into the company name or lost.

**Tech Stack:** TypeScript strict, Chrome Extension Manifest V3 (`chrome.tabs`, `chrome.scripting`, optional LinkedIn host permission), Svelte 5 runes, Zod, Vitest/jsdom, Playwright, pnpm/Turborepo.

## Global Constraints

- Follow `Model → Review → Implement → Verify`; the approved sources of truth are `apps/extension/src/models/linkedin-import.model.md` and `apps/extension/src/models/cv-experience-sync.model.md`.
- Core remains pure: no I/O, async, `Date.now()`, browser globals, or Shell imports under `src/lib/core/`.
- The source LinkedIn tab is never navigated, focused, or closed.
- Do not add the broad `tabs` permission; keep `https://www.linkedin.com/*` in `optional_host_permissions`.
- Open at most one detail tab with `active: false`, and attempt to close it exactly once after `TAB_OPENED`, on every terminal path.
- Use `DETAIL_PAGE_LOAD_TIMEOUT_MS = 15_000`, `DETAIL_LIST_STABILIZE_TIMEOUT_MS = 10_000`, and `DETAIL_LIST_OBSERVATION_MS = 500`.
- Do not merge rows observed before stabilization or timeout.
- Do not call undocumented LinkedIn APIs and do not fetch application-shell HTML.
- Preserve line boundaries until fields are assigned; normalize whitespace afterward.
- Svelte changes use runes and native event attributes only; no stores or Svelte 4 syntax.
- No `any`; use explicit interfaces, `unknown`, and guards.
- Every behavior change follows RED → verify RED → minimal GREEN → verify GREEN → refactor.
- Commit messages use Conventional Commits and remain atomic.

---

## File Map

**Create**

- `apps/extension/src/lib/shell/profile-extractors/linkedin-experience-dom.ts` — self-contained async function injected into the rendered LinkedIn detail page.
- `apps/extension/src/lib/shell/profile-extractors/linkedin-experience-loader.ts` — detail URL derivation, inactive-tab readiness, script execution, error mapping, and cleanup.
- `apps/extension/tests/unit/profile-extractors/linkedin-experience-dom.test.ts` — DOM contract, grouped roles, lazy rendering, empty and blocked states.
- `apps/extension/tests/unit/profile-extractors/linkedin-experience-loader.test.ts` — detail-tab state-machine and cleanup paths.
- `apps/extension/tests/unit/ui/ExperienceCard.test.ts` — edit/display contract for `employmentType`.
- `apps/extension/tests/fixtures/linkedin-experience-detail.html` — sanitized standalone and grouped-position detail DOM.
- `apps/extension/tests/fixtures/linkedin-experience-empty.html` — recognized owner empty state.
- `apps/extension/tests/fixtures/linkedin-experience-challenge.html` — challenge interstitial.

**Modify**

- `apps/extension/src/lib/core/types/profile.ts` and `schemas.ts` — persisted `employmentType` with legacy default.
- `apps/extension/src/lib/core/profile-extractors/types.ts`, `linkedin-parser.ts`, and `normalize-candidate-profile.ts` — raw/canonical propagation.
- `apps/extension/src/lib/core/cv/experience-helpers.ts` — trim, merge-fill, and payload formatting.
- `apps/extension/src/lib/shell/messaging/schemas.ts` — canonical draft bridge schema.
- `apps/extension/src/lib/state/cv-experience.svelte.ts` — blank manual draft.
- `apps/extension/src/ui/molecules/ExperienceEditForm.svelte` and `ExperienceCard.svelte` — edit/display contract type.
- `apps/extension/src/lib/shell/profile-extractors/linkedin.extractor.ts` — source metadata + complete detail rows composition.
- `apps/extension/src/lib/shell/profile-extractors/profile-extractor-errors.ts` and `apps/extension/src/lib/core/sync/connected-dashboard.ts` — recoverable `detail_page_unavailable` code.
- `apps/extension/src/ui/pages/CvPage.svelte` — truthful empty/recovery copy.
- Existing LinkedIn, schema, CV helper, dev-stub, background, and E2E fixtures listed per task below.

---

### Task 1: Persist the LinkedIn employment type end-to-end

**Files:**

- Modify: `apps/extension/src/lib/core/types/profile.ts:20-34`
- Modify: `apps/extension/src/lib/core/types/schemas.ts:193-216`
- Modify: `apps/extension/src/lib/core/profile-extractors/types.ts:5-58`
- Modify: `apps/extension/src/lib/core/profile-extractors/linkedin-parser.ts:32-59`
- Modify: `apps/extension/src/lib/core/profile-extractors/normalize-candidate-profile.ts:143-177`
- Modify: `apps/extension/src/lib/core/cv/experience-helpers.ts:31-48,72-105,128-190`
- Modify: `apps/extension/src/lib/shell/messaging/schemas.ts:287-300`
- Test: `apps/extension/tests/unit/profile-extractors/linkedin-parser.test.ts`
- Test: `apps/extension/tests/unit/cv/experience-helpers.test.ts`
- Test: `apps/extension/tests/unit/storage/profile-validation.test.ts`
- Test fixtures: `apps/extension/src/dev/chrome-stubs.ts`, `apps/extension/src/dev/mocks.ts`, `apps/extension/src/dev/qa-seed.ts`, `apps/extension/tests/e2e/linkedin-import.test.ts`, `apps/extension/tests/unit/messaging/schemas.test.ts`, `apps/extension/tests/unit/profile-extractors/linkedin-extractor.test.ts`, `apps/extension/tests/unit/profile-extractors/merge-candidate-profile.test.ts`, `apps/extension/tests/unit/profile/normalize-profile.test.ts`

**Interfaces:**

- Produces: `Experience.employmentType: string | null`, `RawExperience.employmentType?: string`, and `CandidateExperienceDraft.employmentType: string | null`.
- Preserves: de-duplication key `(company, title, startDate)`; `employmentType` never changes identity.

- [ ] **Step 1: Write failing parser, schema, normalization, merge, and payload tests**

Add these assertions to the existing focused suites:

```ts
// linkedin-parser.test.ts — raw value reaches the canonical draft
expect(result.value.experiences[0]).toMatchObject({
  company: 'ScaleOps',
  employmentType: 'Freelance',
});

// profile-validation.test.ts — legacy stored data gets a null default
const parsed = UserProfileSchema.parse({
  ...validProfile(),
  experiences: [
    {
      id: 'legacy',
      title: 'Dev',
      company: 'Acme',
      location: null,
      startDate: '2020-01',
      endDate: null,
      isCurrent: true,
      description: '',
      skills: [],
      source: 'manual',
      sourceExternalId: null,
      positionIndex: 0,
      updatedAt: 1,
    },
  ],
});
expect(parsed.experiences[0].employmentType).toBeNull();

// experience-helpers.test.ts — imported contract fills only an empty local value
const merged = mergeExperiences(
  [baseExperience({ employmentType: null })],
  [draft({ employmentType: 'Freelance' })],
  NOW
);
expect(merged[0].employmentType).toBe('Freelance');

const kept = mergeExperiences(
  [baseExperience({ employmentType: 'CDI' })],
  [draft({ employmentType: 'Freelance' })],
  NOW
);
expect(kept[0].employmentType).toBe('CDI');

expect(formatExperiencePayload([baseExperience({ employmentType: 'Freelance' })])).toContain(
  'Lead Frontend — Acme · Freelance'
);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @pulse/extension exec vitest run \
  tests/unit/profile-extractors/linkedin-parser.test.ts \
  tests/unit/cv/experience-helpers.test.ts \
  tests/unit/storage/profile-validation.test.ts
```

Expected: FAIL because `employmentType` is absent/defaulted away and the payload omits it.

- [ ] **Step 3: Add the canonical field and deterministic propagation**

Apply these exact shapes:

```ts
// core/types/profile.ts
export interface Experience {
  id: string;
  title: string;
  company: string | null;
  employmentType: string | null;
  // existing fields unchanged
}

// core/profile-extractors/types.ts
export interface RawExperience {
  title?: string;
  company?: string;
  employmentType?: string;
  // existing fields unchanged
}

export interface CandidateExperienceDraft {
  title: string;
  company: string | null;
  employmentType: string | null;
  // existing fields unchanged
}

// core/types/schemas.ts — missing legacy property becomes null
employmentType: z.string().nullable().default(null),

// shell/messaging/schemas.ts — tolerate an older extension context
employmentType: SafeString.nullable().default(null),

// linkedin-parser.ts
employmentType: optionalString(item.employmentType),

// normalize-candidate-profile.ts
employmentType: cleanText(experience.employmentType) || null,
```

Update `normalizeExperience`, new imported entries, and matched merges as follows:

```ts
employmentType: trimToNull(draft.employmentType) ?? null,

// matched imported row
employmentType: existing.employmentType ?? draft.employmentType,

// new imported row
employmentType: draft.employmentType,
```

Format the header without changing its date semantics:

```ts
const role = [exp.title, exp.company].filter(Boolean).join(' — ');
const contract = exp.employmentType ? ` · ${exp.employmentType}` : '';
const range = formatExperienceDateRange(exp);
const lines = [`${role}${contract}${range ? ` · ${range}` : ''}`];
```

Add `employmentType: null` to typed source/dev/test fixtures; use a meaningful non-null value in LinkedIn fixtures. Do not touch mission connector `company` fields.

- [ ] **Step 4: Run focused tests and typecheck for GREEN**

Run:

```bash
pnpm --filter @pulse/extension exec vitest run \
  tests/unit/profile-extractors/linkedin-parser.test.ts \
  tests/unit/cv/experience-helpers.test.ts \
  tests/unit/storage/profile-validation.test.ts \
  tests/unit/messaging/schemas.test.ts \
  tests/unit/profile/normalize-profile.test.ts
pnpm --filter @pulse/extension typecheck
```

Expected: all listed tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the domain slice**

```bash
git add apps/extension/src/lib/core apps/extension/src/lib/shell/messaging \
  apps/extension/src/dev apps/extension/tests
git commit -m "feat(cv): persist employment type"
```

---

### Task 2: Edit and display employment type in the CV feed

**Files:**

- Modify: `apps/extension/src/lib/state/cv-experience.svelte.ts:133-159`
- Modify: `apps/extension/src/ui/molecules/ExperienceEditForm.svelte:14-72,92-130`
- Modify: `apps/extension/src/ui/molecules/ExperienceCard.svelte:47-92`
- Create: `apps/extension/tests/unit/state/cv-experience.test.ts`
- Create: `apps/extension/tests/unit/ui/ExperienceCard.test.ts`

**Interfaces:**

- Consumes: `Experience.employmentType: string | null` from Task 1.
- Produces: `ExperienceFormData.employmentType: string`; saved values are trimmed by `normalizeExperience`.

- [ ] **Step 1: Write a failing Svelte component test**

First add a focused state test proving a new manual draft starts with the
canonical null value:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createCvExperienceStore } from '../../../src/lib/state/cv-experience.svelte';

it('starts a manual draft with no employment type', () => {
  const store = createCvExperienceStore({
    loadExperiences: async () => [],
    saveExperiences: async () => undefined,
    copyToClipboard: async () => undefined,
    openUrl: async () => undefined,
    platforms: [],
    now: () => 1,
    generateId: vi.fn(() => 'exp-1'),
  });
  store.newExperience();
  expect(store.draft?.employmentType).toBeNull();
});
```

Then add the component edit/display contract:

```ts
/** @vitest-environment jsdom */
import { mount, tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import ExperienceCard from '../../../src/ui/molecules/ExperienceCard.svelte';

it('displays and edits the employment type', async () => {
  const onSave = vi.fn();
  const experience = {
    id: 'exp-1',
    title: 'Technical Lead',
    company: 'Acme',
    employmentType: 'Freelance',
    location: 'Paris',
    startDate: '2023-01',
    endDate: null,
    isCurrent: true,
    description: '',
    skills: [],
    source: 'linkedin' as const,
    sourceExternalId: null,
    positionIndex: 0,
    updatedAt: 1,
  };
  const target = document.createElement('div');
  mount(ExperienceCard, {
    target,
    props: { experience, draft: experience, isEditing: true, onSave },
  });

  const input = target.querySelector<HTMLInputElement>('input[name="employmentType"]');
  expect(input?.value).toBe('Freelance');
  input!.value = 'Indépendant';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  target.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  await tick();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ employmentType: 'Indépendant' }));
});

it('shows the employment type on a collapsed card', () => {
  const displayExperience = {
    id: 'exp-2',
    title: 'Technical Lead',
    company: 'Acme',
    employmentType: 'Freelance',
    location: 'Paris',
    startDate: '2023-01',
    endDate: null,
    isCurrent: true,
    description: '',
    skills: [],
    source: 'linkedin' as const,
    sourceExternalId: null,
    positionIndex: 0,
    updatedAt: 1,
  };
  const target = document.createElement('div');
  mount(ExperienceCard, { target, props: { experience: displayExperience } });
  expect(target.textContent).toContain('Freelance');
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/ui/ExperienceCard.test.ts`

Expected: FAIL because the named field does not exist.

- [ ] **Step 3: Add the Svelte 5 form and visible metadata**

Add `employmentType` to `ExperienceFormData`, initialize it with `$state(untrack(...))`, and include it in `onSave`:

```ts
let employmentType = $state(untrack(() => draft?.employmentType ?? ''));

onSave({
  title: title.trim(),
  company: company.trim(),
  employmentType: employmentType.trim(),
  // existing fields unchanged
});
```

Render this optional field beside company:

```svelte
<label class="flex flex-col gap-1">
  <span class="text-[11px] font-medium text-text-secondary">Type de contrat</span>
  <input
    name="employmentType"
    bind:value={employmentType}
    type="text"
    placeholder="Freelance, CDI, Temps plein"
    class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
  />
</label>
```

Set `employmentType: null` in `newExperience()` and display a compact metadata span in `ExperienceCard.svelte` when non-null.

- [ ] **Step 4: Verify component, state, accessibility, and type checks**

Run:

```bash
pnpm --filter @pulse/extension exec vitest run \
  tests/unit/ui/ExperienceCard.test.ts \
  tests/unit/ui/operational-ui-constraints.test.ts \
  tests/unit/state/cv-experience.test.ts
pnpm --filter @pulse/extension typecheck
```

Expected: PASS, with no Svelte warnings introduced by these components.

- [ ] **Step 5: Commit the UI slice**

```bash
git add apps/extension/src/lib/state/cv-experience.svelte.ts \
  apps/extension/src/ui/molecules/ExperienceEditForm.svelte \
  apps/extension/src/ui/molecules/ExperienceCard.svelte \
  apps/extension/tests/unit/state/cv-experience.test.ts \
  apps/extension/tests/unit/ui/ExperienceCard.test.ts
git commit -m "feat(cv): edit and display employment type"
```

---

### Task 3: Parse the complete rendered LinkedIn experience page

**Files:**

- Create: `apps/extension/src/lib/shell/profile-extractors/linkedin-experience-dom.ts`
- Create: `apps/extension/tests/unit/profile-extractors/linkedin-experience-dom.test.ts`
- Create: `apps/extension/tests/fixtures/linkedin-experience-detail.html`
- Create: `apps/extension/tests/fixtures/linkedin-experience-empty.html`
- Create: `apps/extension/tests/fixtures/linkedin-experience-challenge.html`

**Interfaces:**

- Produces:

```ts
export interface LinkedInExperienceDomOptions {
  stabilizationTimeoutMs: number;
  observationMs: number;
  stableCycles: number;
}

export type LinkedInExperienceDomSnapshot =
  | { kind: 'ready'; experiences: RawExperience[] }
  | { kind: 'empty'; experiences: [] }
  | { kind: 'blocked'; experiences: []; blockedReason: string }
  | { kind: 'timeout'; experiences: [] }
  | { kind: 'unreadable'; experiences: [] };

export async function extractLinkedInExperiencesFromDom(
  options: LinkedInExperienceDomOptions
): Promise<LinkedInExperienceDomSnapshot>;
```

- Constraint: `extractLinkedInExperiencesFromDom` is self-contained because Chrome serializes the injected function and discards module closure state.

- [ ] **Step 1: Add sanitized fixtures and failing DOM tests**

The main fixture must contain one standalone row and one company group with two leaf roles. Use `aria-hidden="true"` visible lines, a `data-entity-urn`, French dates, a location, description, and `Compétences` text. The tests assert:

```ts
expect(snapshot).toMatchObject({ kind: 'ready' });
if (snapshot.kind !== 'ready') throw new Error('expected ready');
expect(snapshot.experiences).toEqual([
  expect.objectContaining({
    title: 'Technical Lead',
    company: 'BNP Paribas Personal Finance',
    employmentType: 'Freelance',
    dateRange: 'janv. 2023 – oct. 2025',
    location: 'Levallois-Perret, Île-de-France, France · Hybride',
    skills: ['Java', 'Apache Kafka'],
  }),
  expect.objectContaining({ title: 'Staff Engineer', company: 'Acme', employmentType: 'CDI' }),
  expect.objectContaining({ title: 'Software Engineer', company: 'Acme', employmentType: 'CDI' }),
]);
expect(snapshot.experiences).toHaveLength(3); // group container is not emitted
```

Add separate tests for:

- the recognized empty CTA → `kind: 'empty'`;
- a security verification page → `kind: 'blocked'`;
- a recognized list that keeps growing until the deadline → `kind: 'timeout'`;
- a page with no root/list/empty signal → `kind: 'unreadable'`;
- lazy append before stabilization → final row count includes the appended row;
- no duplicate accessible/hidden text;
- newlines are preserved long enough that title is not the entire row.

The empty fixture is recognized only when the resolved experience main/root
contains no position rows and contains the exact owner action “Ajouter un poste”
or “Add position”. A generic zero-row page remains `unreadable`.

- [ ] **Step 2: Run the DOM suite and verify RED**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/profile-extractors/linkedin-experience-dom.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the self-contained bounded extractor**

Inside the exported function, define local-only helpers (`cleanLine`, `visibleLines`, `blockedReasonFromText`, `resolveRoot`, `candidateRows`, `leafRows`, `parseLeaf`, `snapshot`) so serialization is safe. Required parsing rules:

```ts
const [companyPart = '', employmentPart = ''] = companyLine.split(/\s+[·•]\s+/, 2);
const dateRange = lines.find((line) => /\b(19|20)\d{2}\b/.test(line) && /[–—-]/.test(line));
const skillsIndex = lines.findIndex((line) => /^(compétences|skills)\s*:?/i.test(line));
```

- Prefer `.pvs-list__paged-list-item` under the resolved main experience root; only use `li.artdeco-list__item` as a scoped fallback.
- A row containing nested candidate rows is a company group. Parse only its leaf rows and pass the group company text into each leaf.
- Prefer `data-entity-urn` or a stable experience-detail href for `externalId`; fallback to `linkedin-experience-${positionIndex}`.
- Remove visually hidden duplicates, buttons, SVG labels, “voir plus/show more”, durations, and action labels before field assignment.
- Scroll to `document.documentElement.scrollHeight` each observation cycle. Return `ready` only after bottom reached, no active loading indicator, and row count + document height are unchanged for `stableCycles` cycles.
- Track whether a valid experience root/list was ever observed. At the deadline,
  return `timeout` when a recognized list failed to stabilize, or `unreadable`
  when no supported root/empty state ever appeared. Never return accumulated
  rows from either branch.

- [ ] **Step 4: Run DOM tests for GREEN**

Run:

```bash
pnpm --filter @pulse/extension exec vitest run \
  tests/unit/profile-extractors/linkedin-experience-dom.test.ts \
  tests/unit/profile-extractors/linkedin-dom.test.ts
```

Expected: PASS for the new detail contract and the existing challenge-prose regressions.

- [ ] **Step 5: Commit the DOM slice**

```bash
git add apps/extension/src/lib/shell/profile-extractors/linkedin-experience-dom.ts \
  apps/extension/tests/unit/profile-extractors/linkedin-experience-dom.test.ts \
  apps/extension/tests/fixtures/linkedin-experience-*.html
git commit -m "fix(linkedin): parse complete experience detail page"
```

---

### Task 4: Implement the inactive detail-tab lifecycle

**Files:**

- Create: `apps/extension/src/lib/shell/profile-extractors/linkedin-experience-loader.ts`
- Create: `apps/extension/tests/unit/profile-extractors/linkedin-experience-loader.test.ts`
- Modify: `apps/extension/src/lib/shell/profile-extractors/profile-extractor-errors.ts:3-25`
- Modify: `apps/extension/src/lib/core/sync/connected-dashboard.ts:128-139,771-789`

**Interfaces:**

- Consumes: Task 3's `extractLinkedInExperiencesFromDom` and snapshot types.
- Produces:

```ts
export const DETAIL_PAGE_LOAD_TIMEOUT_MS = 15_000;
export const DETAIL_LIST_STABILIZE_TIMEOUT_MS = 10_000;
export const DETAIL_LIST_OBSERVATION_MS = 500;

export interface LinkedInExperienceChromeApi {
  tabs: Pick<typeof chrome.tabs, 'create' | 'get' | 'remove'> & {
    onUpdated: Pick<typeof chrome.tabs.onUpdated, 'addListener' | 'removeListener'>;
    onRemoved: Pick<typeof chrome.tabs.onRemoved, 'addListener' | 'removeListener'>;
  };
  scripting: Pick<typeof chrome.scripting, 'executeScript'>;
}

export function buildLinkedInExperienceDetailUrl(profileUrl: string): string | null;

export async function loadCompleteLinkedInExperiences(
  chromeApi: LinkedInExperienceChromeApi,
  profileUrl: string,
  now: number
): Promise<Result<RawExperience[], AppError>>;
```

- Adds: `ProfileExtractorErrorCode | ProfileExtractorHealthCode` member `detail_page_unavailable`, with `recoverable: true`.

- [ ] **Step 1: Write failing URL/lifecycle/cleanup tests**

Cover these exact outcomes with fake tab events and fake timers:

```ts
expect(buildLinkedInExperienceDetailUrl('https://www.linkedin.com/in/guyghost/')).toBe(
  'https://www.linkedin.com/in/guyghost/details/experience/'
);
expect(buildLinkedInExperienceDetailUrl('https://www.linkedin.com/feed/')).toBeNull();

expect(chrome.tabs.create).toHaveBeenCalledWith({
  url: 'https://www.linkedin.com/in/guyghost/details/experience/',
  active: false,
});
expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
  expect.objectContaining({
    target: { tabId: 99 },
    func: extractLinkedInExperiencesFromDom,
  })
);
expect(chrome.tabs.remove).toHaveBeenCalledTimes(1);
expect(chrome.tabs.remove).toHaveBeenCalledWith(99);
```

Separate tests must prove cleanup after `ready`, `empty`, challenge, unreadable DOM, DOM stabilization timeout, tab-load timeout, executeScript rejection, and manual `onRemoved`. A create failure must call `remove` zero times. A remove failure must not replace the successful rows or original failure. Map snapshot `kind: 'timeout'` to `detail_page_unavailable`; map `kind: 'unreadable'` to `dom_changed`.

For every timeout/failure case, also assert `tabs.create` was called exactly
once: there is no automatic retry.

- [ ] **Step 2: Run the loader suite and verify RED**

Run: `pnpm --filter @pulse/extension exec vitest run tests/unit/profile-extractors/linkedin-experience-loader.test.ts`

Expected: FAIL because loader exports do not exist.

- [ ] **Step 3: Implement URL validation, readiness listeners, mapping, and finally cleanup**

`buildLinkedInExperienceDetailUrl` must parse with `URL`, require hostname `www.linkedin.com`, and match exactly `/in/{one-slug-segment}` before constructing the detail path.

Define the recovery copy once in this module:

```ts
const PROFILE_COPY = 'Ouvrez le profil LinkedIn à importer puis réessayez.';
const LOAD_COPY =
  'La page complète des expériences LinkedIn n’a pas pu être chargée. Rechargez LinkedIn puis relancez l’import.';
const DOM_COPY =
  'La page LinkedIn est chargée, mais sa section Expérience n’est plus reconnue. Rechargez la page puis réessayez.';
```

Implement `waitForDetailTab` with `tabs.onUpdated` + `tabs.onRemoved`, an explicit timeout, and a single `settle()` helper that clears the timer and removes both listeners. If `tabs.create()` already returns `status: 'complete'`, skip listener registration.

The load skeleton is:

```ts
let createdTabId: number | null = null;
try {
  const url = buildLinkedInExperienceDetailUrl(profileUrl);
  if (!url) return err(createProfileExtractorError('profile_not_found', PROFILE_COPY, now));
  const created = await chromeApi.tabs.create({ url, active: false });
  if (created.id === undefined) {
    return err(createProfileExtractorError('detail_page_unavailable', LOAD_COPY, now));
  }
  createdTabId = created.id;
  const readyTab = await waitForDetailTab(chromeApi.tabs, created, DETAIL_PAGE_LOAD_TIMEOUT_MS);
  // Reclassify readyTab.url for login/checkpoint/profile-detail.
  const [injection] = await chromeApi.scripting.executeScript({
    target: { tabId: createdTabId },
    func: extractLinkedInExperiencesFromDom,
    args: [
      {
        stabilizationTimeoutMs: DETAIL_LIST_STABILIZE_TIMEOUT_MS,
        observationMs: DETAIL_LIST_OBSERVATION_MS,
        stableCycles: 2,
      },
    ],
  });
  // Map ready/empty/blocked/unreadable to Result.
} catch (error: unknown) {
  return err(
    createProfileExtractorError('detail_page_unavailable', LOAD_COPY, now, {
      cause: error instanceof Error ? error.message : String(error),
    })
  );
} finally {
  if (createdTabId !== null) {
    await chromeApi.tabs.remove(createdTabId).catch(() => undefined);
  }
}
```

Use French recovery copy:

- `detail_page_unavailable`: “La page complète des expériences LinkedIn n’a pas pu être chargée. Rechargez LinkedIn puis relancez l’import.”
- `dom_changed`: “La page LinkedIn est chargée, mais sa section Expérience n’est plus reconnue. Rechargez la page puis réessayez.”

- [ ] **Step 4: Run loader/error tests and typecheck for GREEN**

Run:

```bash
pnpm --filter @pulse/extension exec vitest run \
  tests/unit/profile-extractors/linkedin-experience-loader.test.ts
pnpm --filter @pulse/extension typecheck
```

Expected: PASS, zero dangling fake timers/listeners, TypeScript exit 0.

- [ ] **Step 5: Commit the lifecycle slice**

```bash
git add apps/extension/src/lib/shell/profile-extractors/linkedin-experience-loader.ts \
  apps/extension/src/lib/shell/profile-extractors/profile-extractor-errors.ts \
  apps/extension/src/lib/core/sync/connected-dashboard.ts \
  apps/extension/tests/unit/profile-extractors/linkedin-experience-loader.test.ts
git commit -m "feat(linkedin): load complete experience page"
```

---

### Task 5: Compose source metadata with the complete detail result

**Files:**

- Modify: `apps/extension/src/lib/shell/profile-extractors/linkedin.extractor.ts:17-45,77-197,209-369`
- Modify: `apps/extension/tests/unit/profile-extractors/linkedin-extractor.test.ts`
- Modify: `apps/extension/tests/unit/background/index.test.ts:450-560`

**Interfaces:**

- Consumes: `loadCompleteLinkedInExperiences(chromeApi, profileUrl, now)` from Task 4.
- Produces: the existing `CanonicalCandidateProfileDraft`; no bridge success shape changes.

- [ ] **Step 1: Rewrite the extractor happy-path test to require detail rows**

Route the Chrome double by target tab ID: source tab `42` returns headline/summary with an intentionally incomplete visible experience; detail tab `99` returns two complete rows. Assert:

```ts
expect(result.ok).toBe(true);
if (!result.ok) throw new Error('expected success');
expect(result.value.experiences.map((item) => item.title)).toEqual([
  'Technical Lead',
  'Software Engineer',
]);
expect(result.value.experiences[0].employmentType).toBe('Freelance');
expect(chromeDouble.tabs?.create).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
expect(chromeDouble.tabs?.remove).toHaveBeenCalledWith(99);
```

Add regressions proving source challenge stops before tab creation and detail failure does not call the canonical parser/merge path.

- [ ] **Step 2: Run extractor/background tests and verify RED**

Run:

```bash
pnpm --filter @pulse/extension exec vitest run \
  tests/unit/profile-extractors/linkedin-extractor.test.ts \
  tests/unit/background/index.test.ts
```

Expected: FAIL because the current extractor only uses visible source-page rows.

- [ ] **Step 3: Integrate the loader after source-page validation**

Keep permission, URL, cookie, source DOM, and source challenge checks in their current order. After a valid source snapshot:

```ts
const detail = await loadCompleteLinkedInExperiences(this.chromeApi, tab.url, now);
if (!detail.ok) {
  return detail;
}

const parsed = parseLinkedInProfilePayload({
  source: 'linkedin',
  profileUrl: snapshot.profileUrl || tab.url,
  capturedAt: new Date(now),
  sections: {
    ...snapshot.sections,
    experiences: detail.value,
  },
});
```

Do not use `snapshot.sections.experiences` as a fallback. Extend the local Chrome interface only with the exact tab/event/scripting members required by the loader.

- [ ] **Step 4: Run complete LinkedIn unit integration for GREEN**

Run:

```bash
pnpm --filter @pulse/extension exec vitest run \
  tests/unit/profile-extractors/linkedin-dom.test.ts \
  tests/unit/profile-extractors/linkedin-experience-dom.test.ts \
  tests/unit/profile-extractors/linkedin-experience-loader.test.ts \
  tests/unit/profile-extractors/linkedin-extractor.test.ts \
  tests/unit/profile-extractors/linkedin-parser.test.ts \
  tests/unit/background/index.test.ts
pnpm --filter @pulse/extension typecheck
```

Expected: PASS and TypeScript exit 0.

- [ ] **Step 5: Commit the composition slice**

```bash
git add apps/extension/src/lib/shell/profile-extractors/linkedin.extractor.ts \
  apps/extension/tests/unit/profile-extractors/linkedin-extractor.test.ts \
  apps/extension/tests/unit/background/index.test.ts
git commit -m "fix(linkedin): import all profile experiences"
```

---

### Task 6: Surface truthful outcomes and verify the user-visible flow

**Files:**

- Modify: `apps/extension/src/ui/pages/CvPage.svelte:32-70`
- Modify: `apps/extension/src/dev/chrome-stubs.ts:112-160,391-415`
- Modify: `apps/extension/tests/e2e/linkedin-import.test.ts`
- Modify: `apps/extension/tests/unit/dev/linkedin-stubs.test.ts`

**Interfaces:**

- Consumes: existing facade result plus `detail_page_unavailable` error messages from Task 4.
- Produces: no new state; only count-aware, actionable UI copy.

- [ ] **Step 1: Add failing E2E assertions for complete data and recovery copy**

Extend `LinkedInBridgeMode` with `detail-page-unavailable`; return:

```ts
{
  errorCode: 'detail_page_unavailable',
  errorMessage: "La page complète des expériences LinkedIn n’a pas pu être chargée. Rechargez LinkedIn puis relancez l’import.",
}
```

The success mock contains at least two experiences, one with `employmentType: 'Freelance'`. Assert the count toast and visible card metadata. Add an empty-success mock and assert exactly `Aucune expérience renseignée sur votre profil LinkedIn.` with no “défilez”.

- [ ] **Step 2: Run LinkedIn E2E and verify RED**

Run:

```bash
pnpm --filter @pulse/extension exec playwright test tests/e2e/linkedin-import.test.ts
```

Expected: FAIL on the obsolete zero-row copy and missing contract display.

- [ ] **Step 3: Replace obsolete guidance and align dev stubs**

In `CvPage.svelte`, replace the `draftCount === 0` branch with:

```ts
showToast('Aucune expérience renseignée sur votre profil LinkedIn.', 'info');
```

Keep `added === 0 && draftCount > 0` and successful pluralization unchanged. Add `employmentType` to the dev profile and ensure stubbed `addedCount` equals the number of newly returned rows.

- [ ] **Step 4: Run E2E and dev-stub tests for GREEN**

Run:

```bash
pnpm --filter @pulse/extension exec vitest run tests/unit/dev/linkedin-stubs.test.ts
pnpm --filter @pulse/extension exec playwright test tests/e2e/linkedin-import.test.ts
```

Expected: PASS; no toast tells the user to scroll.

- [ ] **Step 5: Commit the user-visible slice**

```bash
git add apps/extension/src/ui/pages/CvPage.svelte \
  apps/extension/src/dev/chrome-stubs.ts \
  apps/extension/tests/e2e/linkedin-import.test.ts \
  apps/extension/tests/unit/dev/linkedin-stubs.test.ts
git commit -m "fix(linkedin): show actionable import outcomes"
```

---

### Task 7: Full verification and real-session gate

**Files:**

- Verify only; modify code only if a failing gate reveals an in-scope defect, using a new RED test before the fix.

**Interfaces:**

- Consumes: all previous tasks.
- Produces: build artifact and runtime evidence; no new product API.

- [ ] **Step 1: Run formatting, lint, type, unit, manifest, and build gates**

```bash
pnpm format:check
pnpm --filter @pulse/extension lint
pnpm --filter @pulse/extension typecheck
pnpm --filter @pulse/extension test
pnpm --filter @pulse/extension verify-manifest
pnpm --filter @pulse/extension build
git diff --check
```

Expected: every command exits 0; unit summary has 0 failed tests; manifest still has no `tabs` permission and retains LinkedIn as optional host access.

- [ ] **Step 2: Run the focused browser flow**

```bash
pnpm --filter @pulse/extension exec playwright test tests/e2e/linkedin-import.test.ts
```

Expected: success, duplicate, empty, permission, session, and detail-page-unavailable scenarios all pass.

- [ ] **Step 3: Validate against a real authenticated LinkedIn profile**

After rebuilding/reloading the unpacked extension:

1. Open `https://www.linkedin.com/in/<profile>/` at the top of the page; do not scroll to Experience.
2. Click `Importer LinkedIn` once.
3. Observe one inactive `/details/experience/` tab appear and close without focus change.
4. Confirm the success count equals all leaf positions on the detail page, including grouped roles.
5. Confirm cards show title, clean company, contract type, dates, location, description, and skills.
6. Repeat the import and confirm the duplicate toast with no duplicate cards.
7. Confirm no temporary LinkedIn detail tab remains after success or a forced network failure.

Expected: all seven observations hold. If Chrome control remains unavailable, report this gate as pending user-assisted verification rather than claiming runtime completion.

- [ ] **Step 4: Review scope and history**

```bash
git status --short
git log --oneline --decorate develop..HEAD
git diff --stat develop...HEAD
```

Expected: clean worktree, only the modeled LinkedIn/CV files changed, and atomic Conventional Commits.

---

## Completion Checklist

- [ ] Every model invariant 9–15 has a named automated test.
- [ ] `employmentType` survives raw DOM → canonical draft → bridge → persisted profile → card/payload.
- [ ] The detail tab is never active and never leaks on a tested terminal path.
- [ ] A timeout never merges partial rows.
- [ ] Group containers never produce duplicate experiences.
- [ ] The zero-row message never tells the user to scroll.
- [ ] No `tabs` permission, backend, undocumented API, LLM transition, or Shell import into Core was introduced.
- [ ] Full automated verification is green.
- [ ] Real-session verification is recorded as passed or explicitly pending; it is never inferred from unit tests.
