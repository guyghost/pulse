# Extension Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a releasable MissionPulse MV3 candidate whose critical workflows are model-driven, truthful under failure and cancellation, and verified in the packaged extension rather than only through development stubs.

**Architecture:** The explicit models under `apps/extension/src/models/` define every state transition before implementation. Pure transition logic lives in Core; the service worker and browser APIs remain in Shell; Svelte pages consume state through existing facades and rune stores. Release readiness is fail-closed: the exact ZIP, manifest, source commit, Store metadata and runtime evidence must agree before a release state can advance.

**Tech Stack:** TypeScript strict, Svelte 5 runes, XState v5 for the scan lifecycle, Vitest, Playwright, Chrome Extension Manifest V3, pnpm/Turborepo, GitHub Actions.

## Global Constraints

- Toute modification suit obligatoirement `Model -> Review -> Implement -> Verify`; aucun fichier de production ne change avant validation de Task 1.
- Les fichiers `apps/extension/src/models/` sont la source de vérité des workflows.
- Un LLM ne décide jamais d'une transition d'état; il ne fournit que des signaux.
- Le Core reste pur: zéro I/O, zéro `async`, zéro `chrome.*`, zéro `Date.now()` et aucun import Shell.
- Le side panel ne lit ni IndexedDB ni cookies directement; toutes les opérations passent par facades et messaging.
- Svelte 5 uniquement: `$props`, `$state`, `$derived`, `$effect`, événements natifs; aucun store legacy.
- TypeScript reste `strict`; aucun `any`.
- Chaque bug ou comportement nouveau suit RED -> GREEN -> REFACTOR, avec le test observé en échec avant le code de production.
- Aucun succès UI n'est affiché avant confirmation de l'effet persistant correspondant.
- Une annulation est terminale pour l'opération annulée et invalide tous ses résultats tardifs.
- Le package candidat est l'artefact exact testé; son SHA-256 et le commit source font partie de la preuve de release.

---

### Task 1: Model and review every critical workflow

**Files:**

- Create: `apps/extension/src/models/app-shell.model.md`
- Create: `apps/extension/src/models/onboarding-source.model.md`
- Create: `apps/extension/src/models/scan-lifecycle.model.md`
- Create: `apps/extension/src/models/application-tracking.model.md`
- Create: `apps/extension/src/models/settings-persistence.model.md`
- Create: `apps/extension/src/models/release-readiness.model.md`

**Interfaces:**

- Produces the exact state/event vocabulary consumed by Tasks 2-12.
- `scan-lifecycle.model.md` defines states `idle`, `starting`, `scanning`, `retrying`, `cancelling`, `cancelled`, `persisting`, `completed`, `partial`, `failed`, `busy`.
- `release-readiness.model.md` defines `audited`, `blocked`, `rc_built`, `package_validated`, `store_ready`, `canary`, `production`, `rolled_back`.

- [ ] **Step 1: Write each model with states, events, guards, effects and invariants**

  Each file must contain: scope, context, Mermaid or statechart, transition table, forbidden transitions, side effects, persistence boundary, permissions, retries, cancellations, terminal states, invariants and Review checklist.

- [ ] **Step 2: Cross-review non-happy paths**

  Confirm the tables explicitly cover nominal flow, failure, permission refusal, offline, retry, cancellation, concurrent request, service-worker restart and terminal-state re-entry.

- [ ] **Step 3: Verify model completeness**

  Run:

  ```bash
  rg -n "TBD|TODO|implicit transition|LLM.*transition" apps/extension/src/models/{app-shell,onboarding-source,scan-lifecycle,application-tracking,settings-persistence,release-readiness}.model.md
  ```

  Expected: no placeholders; every mention of an implicit or LLM-driven transition appears only in a forbidden-transition or invariant section.

- [ ] **Step 4: Commit the reviewed models**

  ```bash
  git add apps/extension/src/models
  git commit -m "docs(models): define production readiness workflows"
  ```

### Task 2: Make release validation fail closed on the exact artifact

**Files:**

- Modify: `.github/workflows/release.yml`
- Modify: `scripts/deploy-preflight.mjs`
- Modify: `apps/extension/scripts/release-validation.ts`
- Test: `apps/extension/tests/unit/scripts/release-validation.test.ts`
- Test: `apps/extension/tests/unit/scripts/verify-manifest.test.ts`

**Interfaces:**

- Consumes release states and invariants from `release-readiness.model.md`.
- Produces a validation result that fails unless the post-build manifest, required production environment and exact artifact metadata are valid.

- [ ] **Step 1: Add failing regression tests**

  Add tests asserting that a filtered `dist/manifest.json` is validated with post-build rules and that production preflight returns a non-zero exit code when required production variables are absent.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/scripts/release-validation.test.ts tests/unit/scripts/verify-manifest.test.ts
  ```

  Expected: failure because the current release command omits `--post-build` or treats missing required production configuration as warnings.

- [ ] **Step 3: Implement the minimal fail-closed gate**

  The release workflow and deploy preflight must execute:

  ```bash
  pnpm --filter @pulse/extension verify-manifest dist/manifest.json --post-build --expected-version "$EXPECTED_VERSION"
  ```

  Production mode must accumulate missing required variables and exit `1`; development/dry inspection may continue to report optional warnings.

- [ ] **Step 4: Verify GREEN and exact-artifact validation**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/scripts/release-validation.test.ts tests/unit/scripts/verify-manifest.test.ts
  pnpm --filter @pulse/ui build
  pnpm --filter @pulse/extension build
  pnpm --filter @pulse/extension verify-manifest dist/manifest.json --post-build
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add .github/workflows/release.yml scripts/deploy-preflight.mjs apps/extension/scripts apps/extension/tests/unit/scripts
  git commit -m "fix(release): validate the filtered production artifact"
  ```

### Task 3: Give bootstrap and lazy-page failures explicit recovery

**Files:**

- Modify: `apps/extension/src/lib/state/app-navigation.svelte.ts`
- Modify: `apps/extension/src/sidepanel/App.svelte`
- Test: `apps/extension/tests/unit/state/app-navigation.test.ts`
- Test: `apps/extension/tests/unit/ui/AppShell.test.ts`

**Interfaces:**

- Consumes `AppBootStatus` and the transitions from `app-shell.model.md`.
- Produces `retryBootstrap(): Promise<void>` and per-page `loading | ready | error` status with `retryPage(page)`.

- [ ] **Step 1: Add RED tests**

  Cover bootstrap rejection -> visible error -> retry -> ready, and dynamic import rejection -> visible page error -> retry imports the page once more.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/state/app-navigation.test.ts tests/unit/ui/AppShell.test.ts
  ```

- [ ] **Step 3: Implement explicit recovery**

  `createAppNavigation()` exposes `retryBootstrap`. `App.svelte` tracks page load status in a typed `Record<Page, PageLoadStatus>`, catches import rejection, and renders an `OperationalEmptyState` with a retry callback rather than an indefinite skeleton.

- [ ] **Step 4: Verify GREEN and type safety**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/state/app-navigation.test.ts tests/unit/ui/AppShell.test.ts
  pnpm --filter @pulse/extension typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/src/lib/state/app-navigation.svelte.ts apps/extension/src/sidepanel/App.svelte apps/extension/tests/unit/state/app-navigation.test.ts apps/extension/tests/unit/ui/AppShell.test.ts
  git commit -m "fix(shell): recover from bootstrap and page load failures"
  ```

### Task 4: Make scan cancellation deterministic with an XState model

**Files:**

- Modify: `apps/extension/package.json`
- Create: `apps/extension/src/models/scan-lifecycle.machine.ts`
- Modify: `apps/extension/src/lib/shell/scan/scanner.ts`
- Modify: `apps/extension/src/background/index.ts`
- Modify: `apps/extension/src/lib/shell/facades/feed-controller.svelte.ts`
- Test: `apps/extension/tests/unit/scan/scan-lifecycle-machine.test.ts`
- Test: `apps/extension/tests/unit/scan/scanner.test.ts`
- Test: `apps/extension/tests/unit/facades/feed-controller.test.ts`

**Interfaces:**

- Produces `scanLifecycleMachine` and `ScanLifecycleEvent` from the model source.
- `runScan(..., signal?: AbortSignal)` must reject with a typed cancelled result and must not persist or emit completion after cancellation.
- Each scan has an operation id; UI ignores messages whose operation id is not current.

- [ ] **Step 1: Add XState and write RED transition tests**

  ```bash
  pnpm --filter @pulse/extension add xstate@^5
  ```

  Tests assert allowed/forbidden transitions, cancellation from `starting`, `scanning`, `retrying`, and `persisting`, terminal `cancelled`, and `busy` for concurrent start.

- [ ] **Step 2: Add RED integration tests**

  Assert cancellation aborts fetch/backoff, prevents persistence, emits `SCAN_CANCELLED`, restores the cold Feed to `empty`, and ignores a late `SCAN_COMPLETE` for the cancelled operation id.

- [ ] **Step 3: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/scan/scan-lifecycle-machine.test.ts tests/unit/scan/scanner.test.ts tests/unit/facades/feed-controller.test.ts
  ```

- [ ] **Step 4: Implement minimal machine-driven orchestration**

  Use an `AbortController` owned by the service worker. Propagate its signal through connector work and retry delays. On cancel, abort, transition once to `cancelled`, clear pending Feed arrival state and never run score/persist/complete effects.

- [ ] **Step 5: Verify GREEN**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/scan/scan-lifecycle-machine.test.ts tests/unit/scan/scanner.test.ts tests/unit/facades/feed-controller.test.ts tests/unit/background/index.test.ts
  pnpm --filter @pulse/extension typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add pnpm-lock.yaml apps/extension/package.json apps/extension/src/models/scan-lifecycle.machine.ts apps/extension/src/lib/shell/scan/scanner.ts apps/extension/src/background/index.ts apps/extension/src/lib/shell/facades/feed-controller.svelte.ts apps/extension/tests/unit
  git commit -m "fix(scan): make cancellation a terminal state"
  ```

### Task 5: Remove false success from application tracking

**Files:**

- Modify: `apps/extension/src/background/index.ts`
- Modify: `apps/extension/src/lib/state/tracking.svelte.ts`
- Modify: `apps/extension/src/ui/pages/ApplicationsPage.svelte`
- Modify: `apps/extension/src/ui/pages/FeedPage.svelte`
- Test: `apps/extension/tests/unit/background/index.test.ts`
- Test: `apps/extension/tests/unit/state/tracking.test.ts`
- Test: `apps/extension/tests/unit/ui/ApplicationsPage.test.ts`

**Interfaces:**

- Consumes transition guards from `application-tracking.model.md`.
- Tracking mutation methods resolve only after persistence and reject with a typed application error on failure.

- [ ] **Step 1: Replace the existing false-green test with RED expectations**

  Assert `UPDATE_TRACKING` and `UPDATE_TRACKING_DETAILS` return an error response when storage fails; the state store keeps the previous tracking; pages show an error toast and create no undo entry.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/background/index.test.ts tests/unit/state/tracking.test.ts tests/unit/ui/ApplicationsPage.test.ts
  ```

- [ ] **Step 3: Propagate persistence failure**

  Remove fallback success payloads in the service worker. Re-throw or return a typed error through the bridge. Only emit success toast and undo after the awaited store operation resolves.

- [ ] **Step 4: Verify GREEN**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/background/index.test.ts tests/unit/state/tracking.test.ts tests/unit/ui/ApplicationsPage.test.ts tests/unit/ui/MissionCard.test.ts
  pnpm --filter @pulse/extension typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/src/background/index.ts apps/extension/src/lib/state/tracking.svelte.ts apps/extension/src/ui/pages apps/extension/tests/unit
  git commit -m "fix(tracking): report persistence failures truthfully"
  ```

### Task 6: Make settings persistence transactional and visible

**Files:**

- Modify: `apps/extension/src/lib/state/settings-page.svelte.ts`
- Modify: `apps/extension/src/ui/pages/SettingsPage.svelte`
- Test: `apps/extension/tests/unit/state/settings-page.test.ts`
- Test: `apps/extension/tests/e2e/settings.test.ts`

**Interfaces:**

- Consumes `settings-persistence.model.md`.
- Every setting mutation has `previous`, `saving`, `saved`, `failed`; failure restores `previous` and exposes a user-visible retryable error.

- [ ] **Step 1: Add RED unit tests**

  Cover failed persistence for auto-scan, interval, notifications and theme. Assert rollback, `saveStatus === 'failed'`, and preserved error copy.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/state/settings-page.test.ts
  ```

- [ ] **Step 3: Implement a single transactional mutation helper**

  The helper snapshots the prior value, applies the candidate, awaits facade persistence, commits on success, and restores the prior value on rejection. The page renders one scoped error with a retry callback.

- [ ] **Step 4: Verify GREEN and reload persistence**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/state/settings-page.test.ts tests/unit/ui/ScanSettings.test.ts
  pnpm --filter @pulse/extension typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/src/lib/state/settings-page.svelte.ts apps/extension/src/ui/pages/SettingsPage.svelte apps/extension/tests
  git commit -m "fix(settings): rollback failed persistent changes"
  ```

### Task 7: Unify connector selection across onboarding and Settings

**Files:**

- Modify: `apps/extension/src/lib/shell/connectors/meta.ts`
- Modify: `apps/extension/src/lib/shell/connectors/build-config.ts`
- Modify: `apps/extension/src/ui/organisms/OnboardingWizard.svelte`
- Modify: `apps/extension/src/ui/pages/SettingsPage.svelte`
- Modify: `apps/extension/src/lib/state/settings-page.svelte.ts`
- Test: `apps/extension/tests/unit/ui/OnboardingWizard.test.ts`
- Test: `apps/extension/tests/unit/state/settings-page.test.ts`
- Test: `apps/extension/tests/e2e/onboarding.test.ts`

**Interfaces:**

- Consumes connector states from `onboarding-source.model.md` and the filtered `INCLUDED_CONNECTOR_IDS` catalogue.
- Onboarding selects and persists an included connector, checks permission/session, and exposes refusal/error/retry.
- Settings Sources shows the same included connectors with enabled, permission, session, last sync, error and retry state.

- [ ] **Step 1: Add RED tests**

  Assert excluded connectors never render, Continue is disabled until the selected connector is persisted and checked, permission refusal remains on the source step, and Settings renders/toggles only shipped connectors.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/ui/OnboardingWizard.test.ts tests/unit/state/settings-page.test.ts tests/unit/connectors/meta.test.ts
  ```

- [ ] **Step 3: Implement the shared source projection**

  Derive both screens from build-filtered metadata. Persist the enabled connector through the settings facade; run permission/session checks through the service worker; model `checking`, `ready`, `permission_denied`, `session_missing`, `failed` explicitly.

- [ ] **Step 4: Verify GREEN**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/ui/OnboardingWizard.test.ts tests/unit/state/settings-page.test.ts tests/unit/connectors
  pnpm --filter @pulse/extension typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/src/lib/shell/connectors apps/extension/src/lib/state/settings-page.svelte.ts apps/extension/src/ui/organisms/OnboardingWizard.svelte apps/extension/src/ui/pages/SettingsPage.svelte apps/extension/tests
  git commit -m "feat(connectors): unify onboarding and settings sources"
  ```

### Task 8: Make install consent and alarms coexist safely

**Files:**

- Modify: `apps/extension/src/background/index.ts`
- Modify: `apps/extension/src/lib/shell/health/probe-scheduler.ts`
- Test: `apps/extension/tests/unit/background/index.test.ts`
- Test: `apps/extension/tests/unit/health/probe-scheduler.test.ts`

**Interfaces:**

- Auto-scan begins only after onboarding/explicit consent.
- Alarm setup clears/replaces only MissionPulse-owned alarm names and routes `probe:*` alarms to the probe scheduler.
- Temporary first-scan settings are restored in `finally` on success, failure or cancellation.

- [ ] **Step 1: Add RED tests**

  Cover fresh install without consent, consented install, failed first scan restoration, coexistence of auto-scan/digest/probe alarms, and dispatch of a `probe:*` alarm.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/background/index.test.ts tests/unit/health/probe-scheduler.test.ts
  ```

- [ ] **Step 3: Implement scoped alarm and consent behavior**

  Replace `chrome.alarms.clearAll()` with named clear/create operations. Gate first scan on the persisted onboarding/consent flag. Wrap any temporary settings override in `try/finally`.

- [ ] **Step 4: Verify GREEN**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/background/index.test.ts tests/unit/health/probe-scheduler.test.ts
  pnpm --filter @pulse/extension typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/src/background/index.ts apps/extension/src/lib/shell/health/probe-scheduler.ts apps/extension/tests/unit/background apps/extension/tests/unit/health
  git commit -m "fix(background): respect consent and preserve probe alarms"
  ```

### Task 9: Make Feed states and modal accessibility consistent

**Files:**

- Modify: `apps/extension/src/ui/pages/FeedPage.svelte`
- Modify: `apps/extension/src/ui/organisms/MissionArrivalStack.svelte`
- Modify: `apps/extension/src/ui/molecules/BackupRestoreModal.svelte`
- Modify: `apps/extension/src/ui/organisms/MissionComparison.svelte`
- Modify: `apps/extension/src/ui/organisms/MissionInvestigationDrawer.svelte`
- Test: `apps/extension/tests/unit/ui/feed-story.test.ts`
- Test: `apps/extension/tests/unit/ui/MissionArrivalStack.test.ts`
- Test: `apps/extension/tests/e2e/accessibility/a11y.test.ts`

**Interfaces:**

- Arrival tray renders only when the queue model has pending items compatible with the current Feed state.
- Loading exposes cancel only; empty exposes start only; error exposes retry only.
- Dialogs establish initial focus, trap Tab, close on Escape and restore trigger focus.

- [ ] **Step 1: Add RED state and keyboard tests**

  Assert no `+N` tray in empty/loading/error after queue reset, no start CTA during loading, and modal focus/Tab/Escape/restoration behavior.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/ui/feed-story.test.ts tests/unit/ui/MissionArrivalStack.test.ts tests/unit/ui/BackupRestoreModal.test.ts tests/unit/ui/MissionComparison.test.ts
  ```

- [ ] **Step 3: Implement minimal state projection and focus management**

  Consume the existing arrival transition model rather than duplicating conditions in components. Add a shared Svelte action/helper only if all three modal surfaces need identical focus behavior.

- [ ] **Step 4: Verify GREEN**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/ui/feed-story.test.ts tests/unit/ui/MissionArrivalStack.test.ts tests/unit/ui/BackupRestoreModal.test.ts tests/unit/ui/MissionComparison.test.ts tests/unit/ui/accessible-icon-buttons.test.ts
  pnpm --filter @pulse/extension typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/src/ui apps/extension/tests/unit/ui apps/extension/tests/e2e/accessibility
  git commit -m "fix(ui): align feed states and modal focus"
  ```

### Task 10: Add a packaged MV3 runtime test lane

**Files:**

- Create: `apps/extension/playwright.mv3.config.ts`
- Create: `apps/extension/tests/mv3/fixtures.ts`
- Create: `apps/extension/tests/mv3/navigation.test.ts`
- Create: `apps/extension/tests/mv3/runtime.test.ts`
- Modify: `apps/extension/package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces `pnpm --filter @pulse/extension test:mv3`.
- Fixture builds the extension, launches a persistent Chromium context with only `dist` loaded, obtains the extension id from the real service worker, and opens the real side panel page.

- [ ] **Step 1: Write the failing packaged smoke tests**

  Navigation covers onboarding, Feed, Profil, CV, Suivi, TJM and Réglages. Runtime covers service-worker discovery, manifest permissions, persisted settings after reload, alarm presence and absence of DEV globals.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension test:mv3
  ```

  Expected: failure because the command/config/fixture does not exist yet.

- [ ] **Step 3: Implement the MV3 fixture and CI lane**

  Use Playwright's persistent context with `--disable-extensions-except=<dist>` and `--load-extension=<dist>`. Do not import development stubs. Preserve traces and screenshots on failure.

- [ ] **Step 4: Verify GREEN locally**

  ```bash
  pnpm --filter @pulse/ui build
  pnpm --filter @pulse/extension build
  pnpm --filter @pulse/extension test:mv3
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/playwright.mv3.config.ts apps/extension/tests/mv3 apps/extension/package.json .github/workflows/ci.yml
  git commit -m "test(extension): exercise the packaged mv3 runtime"
  ```

### Task 11: Align Store metadata, permissions and public caching

**Files:**

- Modify: `apps/extension/src/manifest.json`
- Modify: `docs/store-listing.md`
- Modify: `docs/privacy-policy.md`
- Modify: `apps/landing/src/routes/privacy/+page.svelte`
- Modify: `apps/landing/src/hooks.server.ts`
- Modify: `apps/dashboard/src/hooks.server.ts`
- Test: `apps/extension/tests/unit/scripts/verify-manifest.test.ts`
- Create: `apps/landing/src/hooks.server.test.ts`
- Create: `apps/dashboard/src/hooks.server.test.ts`

**Interfaces:**

- Listing and privacy copy enumerate exactly the connectors in the production build catalogue.
- Authenticated HTML is `private, no-store`; public caching applies only to an explicit anonymous-route allowlist.
- Unused `missionpulse.app` host permission is removed unless a test proves a runtime need.

- [ ] **Step 1: Add RED contract tests**

  Assert metadata connector names equal the shipped catalogue, manifest contains no unused MissionPulse host permission, authenticated responses are never publicly cacheable, and anonymous allowlisted pages retain the intended five-minute cache.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/scripts/verify-manifest.test.ts
  pnpm --filter @pulse/landing test -- --run src/hooks.server.test.ts
  pnpm --filter @pulse/dashboard test -- --run src/hooks.server.test.ts
  ```

- [ ] **Step 3: Align configuration and copy**

  Use Free-Work, LeHibou, Hiway and Cherry Pick wherever the production package is described. Remove incomplete privacy placeholders. Apply cache headers from authentication and route classification, never from a global HTML check alone.

- [ ] **Step 4: Verify GREEN**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/scripts/verify-manifest.test.ts
  pnpm --filter @pulse/landing test
  pnpm --filter @pulse/dashboard test
  pnpm --filter @pulse/extension verify-manifest
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/src/manifest.json docs apps/landing apps/dashboard
  git commit -m "fix(release): align privacy metadata and cache policy"
  ```

### Task 12: Build and verify the release candidate evidence bundle

**Files:**

- Create: `docs/release/0.2.3-rc-evidence.md`
- Modify: `docs/PRODUCTION.md`

**Interfaces:**

- Consumes all prior task outputs.
- Produces the exact commit, package version, ZIP path, SHA-256, manifest summary, scenario matrix and external Store/canary prerequisites.

- [ ] **Step 1: Run the complete local gate**

  ```bash
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm --filter @pulse/extension verify-manifest dist/manifest.json --post-build
  pnpm --filter @pulse/extension test:mv3
  ```

- [ ] **Step 2: Build the publication ZIP and hash it**

  ```bash
  pnpm --filter @pulse/extension build:extension
  shasum -a 256 apps/extension/releases/*.zip
  ```

- [ ] **Step 3: Record evidence without claiming external completion**

  The evidence document records every command and result, marks Chrome Web Store credentials/dashboard fields, live connector sessions, canary and rollback rehearsal as `external gate required`, and keeps release state at `package_validated` until those gates are performed.

- [ ] **Step 4: Verify repository cleanliness and diff**

  ```bash
  git diff --check
  git status --short
  ```

- [ ] **Step 5: Commit the evidence**

  ```bash
  git add docs/release/0.2.3-rc-evidence.md docs/PRODUCTION.md
  git commit -m "docs(release): record release candidate evidence"
  ```
