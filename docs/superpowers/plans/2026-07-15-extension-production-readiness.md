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

### Task 5b: Make tracking mutations revisioned, serialized and restart-safe

**Files:**

- Modify: `apps/extension/src/models/application-tracking.model.md`
- Create: `apps/extension/src/models/application-tracking.machine.ts`
- Create: `apps/extension/src/models/application-tracking.machine.logic.ts`
- Create: `apps/extension/src/models/application-tracking.machine.contract.ts`
- Modify: `apps/extension/src/models/db-migration.model.md`
- Create: `apps/extension/src/models/local-data-reset.model.md`
- Create: `apps/extension/src/models/local-data-reset.machine.ts`
- Create: `apps/extension/src/models/local-data-reset.contract.ts`
- Create: `apps/extension/src/models/local-data-reset-epoch.contract.ts`
- Create: `apps/extension/src/models/dataset-startup.model.md`
- Create: `apps/extension/src/models/dataset-startup.contract.ts`
- Create: `apps/extension/src/models/dataset-startup.logic.ts`
- Create: `apps/extension/src/models/dataset-startup.machine.ts`
- Create: `apps/extension/src/lib/core/tracking/v2-contract.ts`
- Create: `apps/extension/src/lib/core/tracking/command-digest.ts`
- Create: `apps/extension/src/lib/core/tracking/transaction-plan.ts`
- Modify: `apps/extension/src/lib/core/tracking/index.ts`
- Modify: `apps/extension/src/lib/shell/storage/tracking.ts`
- Modify: `apps/extension/src/lib/shell/storage/db.ts`
- Modify: `apps/extension/src/lib/shell/messaging/bridge.ts`
- Modify: `apps/extension/src/lib/shell/messaging/schemas.ts`
- Modify: `apps/extension/src/background/index.ts`
- Modify: `apps/extension/src/lib/state/tracking.svelte.ts`
- Test: `apps/extension/tests/unit/tracking/`
- Test: `apps/extension/tests/unit/models/application-tracking-machine.model.test.ts`
- Test: `apps/extension/tests/unit/background/index.test.ts`
- Test: `apps/extension/tests/unit/state/tracking.test.ts`

**Interfaces:**

- Closes the explicit post-Task-5 debt from `application-tracking.model.md`.
- Adds mutation IDs, monotonic per-mission revisions, compare-and-swap Undo,
  per-mission serialization, duplicate-delivery idempotency and restart
  reconciliation before any success/Undo projection.
- Adds the DB6/data3 schema seam for a durable local outbox while keeping the
  production connected-dashboard capability fail-closed and disabled. Task 5b
  must produce zero outbox rows and zero dashboard network calls; delivery,
  leases, retries and remote acknowledgement require a separate reviewed model.
- Coordinates migration, restart recovery and destructive local reset through
  a durable reset journal and one global dataset epoch. Every bridge mutation
  carries that epoch; every internal writer holds and revalidates a revocable
  epoch lease before commit, so stale panels, alarms and worker continuations
  cannot mutate the replacement dataset.
- The reset writes and reads back one bounded latest-only completion receipt
  before checkpointing `committed`; a cold replay after journal clear recognizes
  that exact receipt plus DB6/data3 authority without requiring the new epoch to
  remain empty.
- Startup remains model-owned after admission: a publication failure must issue
  a correlated authority-fence command and may reach retryable `failed` only
  after strict closed-admission, zero-lease and revocation proof. An ambiguous
  fence stays blocked.
- `ready` remains active for late callers. A fresh request ID executes only a
  new correlated bootstrap publication; duplicates are idempotent and no
  migration, Settings recovery or admission step is replayed.
- Unknown startup arrays are captured through exact own descriptors, including
  `length`, with zero getter/`get`-trap reads and fail-closed handling of revoked,
  sparse, accessor or extra-key shapes.

- [ ] **Step 1: Refine and independently review the target model**

  Define the exact protocol version, reserved error code/intent/message matrix,
  XState events, IndexedDB envelope migration, tombstone lifecycle, restart
  checkpoint rules, disabled-outbox boundary, DB6/data3 migration and journaled
  reset. Stop before implementation until the model review is approved.

- [ ] **Step 2: Add RED actor, storage and integration tests**

  Cover duplicate delivery, same-mission concurrency, different-mission
  independence, stale Undo after an intervening write/delete/recreate, worker
  restart before and after commit, lost acknowledgement, deterministic
  reconciliation, multi-panel convergence, migration retry, blocked reset and
  proof that the disabled capability performs no outbox write or network call.
  For Dataset startup, also cover post-admission fence proof/ambiguity, late
  callers after ready, and hostile unknown-array descriptors before any Shell
  implementation.

- [ ] **Step 3: Implement the reviewed transaction actor**

  Keep transition/CAS logic pure, IndexedDB and runtime messaging in Shell, and
  make the UI consume only confirmed revisioned envelopes. A restart or
  transport-uncertain result must reconcile by mutation ID instead of replaying
  or guessing.

- [ ] **Step 4: Verify GREEN and migration safety**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/tracking tests/unit/background/index.test.ts tests/unit/state/tracking.test.ts tests/unit/storage
  pnpm --filter @pulse/extension typecheck
  pnpm --filter @pulse/extension lint
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/extension/src/models/application-tracking.model.md apps/extension/src/models/application-tracking.machine.ts apps/extension/src/lib/shell/storage apps/extension/src/lib/shell/messaging apps/extension/src/background/index.ts apps/extension/src/lib/state/tracking.svelte.ts apps/extension/tests/unit
  git commit -m "feat(tracking): serialize revisioned mutations"
  ```

### Task 6: Make settings persistence transactional and visible

**Files:**

- Modify: `apps/extension/src/models/settings-persistence.model.md`
- Create: `apps/extension/src/models/settings-persistence.machine.ts`
- Create: `apps/extension/src/models/settings-persistence.logic.ts`
- Create: `apps/extension/src/models/settings-persistence.contract.ts`
- Modify: `apps/extension/src/lib/shell/storage/chrome-storage.ts`
- Modify: `apps/extension/src/lib/shell/facades/settings.facade.ts`
- Modify: `apps/extension/src/lib/shell/messaging/bridge.ts`
- Modify: `apps/extension/src/lib/shell/messaging/schemas.ts`
- Modify: `apps/extension/src/background/index.ts`
- Modify: `apps/extension/src/lib/state/settings-page.svelte.ts`
- Modify: `apps/extension/src/ui/pages/SettingsPage.svelte`
- Test: `apps/extension/tests/unit/storage/chrome-storage.test.ts`
- Test: `apps/extension/tests/unit/background/index.test.ts`
- Test: `apps/extension/tests/unit/state/settings-page.test.ts`
- Test: `apps/extension/tests/e2e/settings.test.ts`

**Interfaces:**

- Consumes the reviewed `settings-persistence.machine.ts` through the service
  worker; the side panel never treats facade transport as persistence proof.
- The canonical settings value is a revisioned whole-record envelope. Every
  mutation uses a mutation ID and CAS, confirms required runtime effects, and
  reconciles ambiguous transport/restart outcomes without replaying the write.
- `generation` advances for every envelope mutation independently of user-visible
  `revision`; reset initialization starts at generation zero, while the final
  reset-owned alarm recovery proof binds the exact settled generation it reached.
- The canonical envelope shares the global dataset epoch and an append-only
  causal outcome ledger with reset. The only durable post-write runtime effect
  is alignment of MissionPulse's named auto-scan alarm; notifications read the
  settled canonical record and each panel projects theme from that record.
- A proven pre-commit failure restores `previous`; an effect failure compensates
  with successor CAS; an uncertain result remains pending until reconciliation.
- Every untrusted result/event is descriptor-snapshotted exactly once at the
  boundary. Shell owns only the auto-started Settings controller façade and its
  synchronous `dispatch(raw)`; machine, actor and `.send` stay private.
  Dispatch reads the current context, normalizes/freezes, grants an ephemeral
  identity capability only around private `actor.send`, and revokes in
  `finally`; delayed/pre-normalized/replayed values never reach XState. Guards
  and actions never reparse the original object.
- `getSnapshot()` and `subscribe()` expose only an explicit minimal Settings
  domain view. Every read/notification recursively clones and deeply freezes
  selected settings, command and error values; no XState snapshot, context,
  machine, `_nodes`, method, collection, native subscription or mutable alias
  crosses the façade, so no rogue actor can wrap the shared admission guard and
  steal an event during the WeakSet window. Observer throw/mutation is isolated;
  nested dispatch, unsubscribe and stop have explicit fail-closed behavior.
- Admission reserves extension-global `chrome.storage.local` headroom under the
  DatasetEpoch gate, including the reset-receipt system reserve, rather than
  checking only the serialized Settings envelope.

- [ ] **Step 1: Independently review the executable model**

  Approve the revision/CAS envelope, command identities, permission boundary,
  runtime-effect acknowledgements, compensation, cancellation winner, exact
  error matrix and restart reconciliation before behavior implementation.

- [ ] **Step 2: Add RED unit tests**

  Cover storage migration/corruption, same-base conflicts, failed persistence,
  effect failure/compensation, lost acknowledgement, restart, cancellation and
  Retry rebase for auto-scan, interval, notifications, theme and connectors.

- [ ] **Step 3: Verify RED**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/state/settings-page.test.ts
  ```

- [ ] **Step 4: Implement the reviewed transaction coordinator**

  Make storage revisioned and CAS-guarded in the service worker, emit the
  private controller's pure commands through strict bridge schemas, route every
  unknown bridge/storage response through `dispatch(raw)`, and expose no raw
  machine/actor/send/native-snapshot escape hatch. Consume only the cloned,
  deeply frozen public view and wrapped unsubscribe handle. Keep the UI on
  confirmed state unless the machine explicitly projects a saving candidate.
  The named auto-scan alarm must acknowledge exact epoch/revision/digest before
  `saved`; theme and notifications must converge from the settled canonical
  record without synthetic worker acknowledgements.

- [ ] **Step 5: Verify GREEN and reload persistence**

  ```bash
  pnpm --filter @pulse/extension exec vitest run tests/unit/state/settings-page.test.ts tests/unit/ui/ScanSettings.test.ts
  pnpm --filter @pulse/extension typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/extension/src/models/settings-persistence.* apps/extension/src/lib/shell/storage/chrome-storage.ts apps/extension/src/lib/shell/facades/settings.facade.ts apps/extension/src/lib/shell/messaging apps/extension/src/background/index.ts apps/extension/src/lib/state/settings-page.svelte.ts apps/extension/src/ui/pages/SettingsPage.svelte apps/extension/tests
  git commit -m "fix(settings): serialize transactional persistence"
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

- Modify: `apps/extension/src/models/release-readiness.model.md`
- Create: `apps/extension/scripts/canonical-artifact.ts`
- Create: `apps/extension/scripts/seal-tested-dist.ts`
- Create: `apps/extension/scripts/package-sealed-dist.ts`
- Create: `apps/extension/scripts/verify-release-artifact.ts`
- Create: `apps/extension/tests/unit/scripts/canonical-artifact.test.ts`
- Create: `apps/extension/tests/unit/scripts/seal-tested-dist.test.ts`
- Create: `apps/extension/tests/unit/scripts/package-sealed-dist.test.ts`
- Create: `apps/extension/tests/unit/scripts/verify-release-artifact.test.ts`
- Modify: `apps/extension/tests/mv3/artifact.ts`
- Modify: `apps/extension/package.json`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/README.md`
- Modify: `.gitignore`
- Create: `docs/release/0.2.2-rc-evidence.md`
- Modify: `docs/PRODUCTION.md`

**Interfaces:**

- Consumes one immutable `TestedDistSeal` emitted by a fresh clean final
  build/local/MV3 gate after Tasks 1-11 are committed. Historical Task 10/11
  bytes remain regression evidence but cannot authorize a candidate changed by
  Tasks 6-9. After that seal, Task 12 is package-only and has no install, build,
  bump, manifest edit, connector resolution or `dist` deletion capability.
- The current candidate remains version `0.2.2`. `0.2.3` is forbidden without
  a committed bump, clean unique build, complete MV3 gate and new seal.
- Produces one structured `ValidatedZipArtifact` linking release ID, seal ID,
  source commit, committed version, canonical source/snapshot/extracted tree,
  manifest digest, ZIP entry receipt, ZIP SHA-256, checksum sidecar and
  per-consumer checksum receipts.
- The shared canonical inventory accepts regular files only, sorts POSIX UTF-8
  paths bytewise under `LC_ALL=C`, and rejects symlinks, special files,
  traversal, duplicates and case/Unicode collisions.

- [ ] **Step 1: Approve the revised package model before implementation**

  Independently review the structured local/MV3 gate receipts,
  `TestedDistSeal`, `ValidatedZipArtifact`, the package-only TOCTOU protocol,
  canonical inventory v2, fixed version `0.2.2`, typed drift failures,
  final-candidate sequencing and the release/CWS consumption receipts. Stop if
  the incoming seal predates any in-scope source change, derives only from a
  per-test/last-test file, admits skipped or missing scenarios, or lacks the
  exact clean source commit, committed version, toolchain, lockfile, connector
  configuration, manifest and complete local/MV3 evidence; Task 12 must never
  manufacture missing provenance.

- [ ] **Step 2: Add RED seal/canonical/package/consumer tests**

  Cover missing/failed local gate; per-test evidence presented as suite proof;
  missing, duplicate, unexpected or skipped MV3 scenario; dirty/crossed source;
  dist mutation during the suite; rebuild/install/bump refusal; changed source
  commit/version/config; lock loss; source drift before/during/after copy;
  symlink, hard-link alias, special file and unsafe/colliding path;
  locale-dependent order; mode and mtime variation; pre-existing/stale archive;
  DEFLATE/ZIP64/data-descriptor or noncanonical ZIP
  flags/versions/attributes; nonzero ZIP extra fields; nondeterministic twin;
  unsafe extraction; divergent tree/count/manifest/version; malformed or
  divergent sidecar; and checksum divergence after upload/download and
  immediately before CWS. Assert that every case yields its typed failure and
  cannot emit a seal or `PACKAGE_VALIDATION_SUCCEEDED`.

- [ ] **Step 3: Implement one shared canonical inspector and package-only runner**

  Hold one exclusive release lock throughout. Verify the seal, copy the exact
  regular-file inventory with no-follow semantics into a fresh private
  snapshot, compare source before/after with the seal, normalize the snapshot
  to files `0644`, directories `0755` and timestamp
  `1980-01-01T00:00:00Z`, then make it read-only. Create two STORE-only archives
  from the bytewise sorted file list in fresh absent paths, with exact canonical
  ZIP headers and no UID/GID/extra fields, then require the same SHA-256.
  Never call `build:extension` or any command that writes `dist`.

- [ ] **Step 4: Extract and validate the exact temporary ZIP**

  Verify ZIP integrity and its complete entry policy, extract through the safe
  validator into a newly created empty directory, then recompute the same v2
  canonical inventory. Require source seal = snapshot = extracted tree =
  source-after-archive, equal file counts and manifest digests, and run
  post-build manifest validation on the extracted manifest with expected
  version `0.2.2`. Only then write and verify the SHA-256 sidecar and atomically
  install both files at previously absent final paths:

  ```text
  apps/extension/releases/missionpulse-0.2.2.zip
  apps/extension/releases/missionpulse-0.2.2.zip.sha256
  ```

- [ ] **Step 5: Commit the candidate source and release tooling**

  Commit all product changes, the reviewed release model, candidate-seal and
  canonical/package runners and tests, the expected MV3 scenario inventory,
  package scripts, workflow gates, `.gitignore`, workflow README and production
  procedure before the final build. The evidence report itself is not created
  yet. Record this clean commit as the only
  `CandidateSourceIdentity.sourceCommit`; no later evidence commit may replace
  it.

- [ ] **Step 6: Create the final seal, then run the package-only gate**

  Require a clean worktree at the candidate-source commit. The candidate gate
  runs the committed format/lint/typecheck/unit/source-manifest checks, performs
  one build, then runs the complete packaged MV3 suite. A post-suite sealer
  emits `tested-dist-seal.json` only after the aggregated report exactly matches
  the committed scenario inventory with zero skipped/failed/unexpected tests,
  runtime diagnostics are settled, and the source, toolchain, connector
  configuration, manifest, pre/post canonical trees and report digests are all
  bound to that same build ID. Individual fixture files are never seal
  authority. The earlier legacy tree
  `51d8d652b97e1068cf9017ac732fe98c28c770bf8b63dd207d9b3b53ba1d64b5`,
  manifest
  `bd458e1285979a40746d1a6d785e55ada5dd367b186562979d3a820a3d6adde6`
  and 66-file receipt are regression evidence only; a final source change must
  produce a fresh seal and may legitimately produce different bytes. After the
  seal is written, canonical inspection and packaging must not replace or
  rewrite the tested `dist`.

  ```bash
  pnpm --filter @pulse/extension release:seal-candidate
  pnpm --filter @pulse/extension exec vitest run tests/unit/scripts/canonical-artifact.test.ts tests/unit/scripts/seal-tested-dist.test.ts tests/unit/scripts/package-sealed-dist.test.ts tests/unit/scripts/verify-release-artifact.test.ts
  pnpm --filter @pulse/extension package:sealed -- --seal ../../output/playwright/mv3-evidence/tested-dist-seal.json --dist dist --version 0.2.2
  pnpm --filter @pulse/extension verify:release-artifact -- --receipt releases/missionpulse-0.2.2.validation.json --zip releases/missionpulse-0.2.2.zip --checksum releases/missionpulse-0.2.2.zip.sha256 --extract-fresh
  ```

- [ ] **Step 7: Gate the release workflow and every consumer**

  The release workflow either owns the unique clean build → manifest → MV3 →
  seal chain or consumes the already archived exact seal. It packages no other
  `dist`. Upload publishes the ZIP, sidecar, seal and validation receipt
  together and records a checksum receipt. Download and the immediate CWS
  boundary each recompute the ZIP SHA-256 from bytes. Any mismatch blocks.
  Automatic direct stable publication is removed: `package_validated`, complete
  Store evidence and all four credential presences, authorized canary,
  observation and explicit promotion remain mandatory modeled gates. CI and
  Release both call the shared package-only runner; no workflow retains a
  `zip -r` or ad hoc archive path. Align the workflow README to the effective
  action versions and gates. Replace the obsolete `zip -r` procedure and the
  removed `missionpulse.app` host-permission claim in `docs/PRODUCTION.md`.

- [ ] **Step 8: Record evidence without claiming external completion**

  `docs/release/0.2.2-rc-evidence.md` records the exact source commit and clean
  boundaries, version/toolchain/configuration identities, seal, canonical
  receipts, ZIP/sidecar checks, extracted manifest, scenario matrix and
  consumer checksum receipts. Chrome Web Store fields and the presence of
  `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` and
  `CHROME_REFRESH_TOKEN`, live connector sessions, canary, observation,
  promotion and rollback rehearsal are marked `external gate required` until
  independently performed. Local evidence cannot claim `store_ready`, `canary`
  or `production`. Generate this tracked report only after the package receipt
  and final candidate cleanliness receipt exist; its later evidence commit is
  not the sealed source commit.

- [ ] **Step 9: Verify exact artifact identity at the candidate boundary**

  ```bash
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm test
  git diff --check
  git status --short
  ```

  Before the evidence-only commit, `git status --short` may name only the new
  evidence report. Generated ZIP, sidecar, seal and validation receipts remain
  ignored immutable outputs, not source changes.

- [ ] **Step 10: Commit evidence and prove final repository cleanliness**

  ```bash
  git add docs/release/0.2.2-rc-evidence.md
  git commit -m "docs(release): record 0.2.2 candidate evidence"
  git diff --check
  git status --short
  ```

  The evidence commit records, but never replaces, the sealed candidate source
  commit from Step 5.
