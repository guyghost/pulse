# QA Report — Settings + cross-cutting (domain-settings-xcut)

Agent: `domain-settings-xcut`
Scope: `SettingsPage.svelte`, Backup/Restore, DangerZone, ScanSettings, SourceHealthPanel, ConnectorHealthCard, ConnectorStatus, ExportMenu, OfflineNotice, KeyboardShortcutsHelp, FeedTourOverlay, ToastContainer/toast state, premium/theme/connection state, core `health/*` and `backup/*`.
Method: Static code analysis + assigned Vitest unit tests. No dev server, no Playwright (per constraints).
Date: 2026-06-27

## Test results (unit)

Command: `cd apps/extension && pnpm exec vitest run <10 files>`

| File                                           | Tests | Result |
| ---------------------------------------------- | ----: | ------ |
| tests/unit/backup/backup.test.ts               |    13 | PASS   |
| tests/unit/health/circuit-breaker.test.ts      |    26 | PASS   |
| tests/unit/health/derive-health-status.test.ts |     5 | PASS   |
| tests/unit/health/health-metrics.test.ts       |    11 | PASS   |
| tests/unit/storage/chrome-storage.test.ts      |    17 | PASS   |
| tests/unit/storage/local-data-reset.test.ts    |     2 | PASS   |
| tests/unit/ui/ToastContainer.test.ts           |     8 | PASS   |
| tests/unit/state/toast.test.ts                 |    12 | PASS   |
| tests/unit/state/connection.test.ts            |    11 | PASS   |
| tests/unit/facades/settings-facade.test.ts     |     6 | PASS   |

**Total: 10 files, 111 tests, all PASS (3.17s).** No skipped/missing files.

---

## 1. Inventory

### SettingsPage (`src/ui/pages/SettingsPage.svelte`)

- Route: `settings` (free). Reached via nav + premium lock CTA "Voir les réglages".
- Sections (anchor-scroll cards): `sources`, `alerts`, `account`, `data`.
- State controller: `SettingsPageController` (`src/lib/state/settings-page.svelte.ts`) — owns scan settings, AI availability, connected account, backup/restore, export, theme, reset.
- Buttons/inputs: theme toggle (light/dark/system), export Markdown/JSON/CSV, "Créer une sauvegarde", "Restaurer" (hidden file input), "Rejouer l'onboarding", "Revoir le tour du feed", DangerZone reset.
- Modals: `BackupRestoreModal` (conditional on `settings.showBackupModal`).
- Offline: renders `OfflineNotice` when `connection.status === 'offline'`.
- Loads alert preferences, favorites, missions, seenIds, alert history on mount (IIFE + `.catch(()=>{})`).

### Sources & cadence (`ScanSettings.svelte`)

- Toggle: auto-scan (role=switch). Range: scan interval 5–120 min, step 5 (disabled visually via `opacity-40` + `pointer-events-none` when autoScan off). Toggle: notifications. History cards: last scan / recent history / next scan.

### Priority alerts (`AlertBuilderCard.svelte`)

- Enable checkbox, score range (40–95, step 5), TJM min (number 0–5000), max results (1–20), required stacks (chips + suggestions), pause 1h/24h/resume, live preview counts, recent history (top 3), Save (with undo via toast action).

### AI / semantic config (inline in SettingsPage)

- Displays `aiAvailability` (available / after-download / no), `maxSemanticPerScan`, transparency items. "Ouvrir l'aide IA Chrome" → external URL.

### Theme (inline + `src/lib/state/theme.svelte.ts`)

- 3 buttons light/dark/system. `updateTheme` dispatches `mp:theme-changed` CustomEvent + persists via settings facade. Theme store applies/removes `.dark` on `<html>`, listens to `prefers-color-scheme`, cross-module sync event, and bridge `SETTINGS_UPDATED`.

### Backup / Restore

- Core: `src/lib/core/backup/backup.ts` (Zod `BackupDataSchema`, version guard, pure create/validate/serialize/parse/migrate/stats/filename).
- Modal: `BackupRestoreModal.svelte` — 3 states (error / backup-preview / loading). Restore requires typing `RESTAURER`; shows profile/favorites/hidden/version stats + impact warning.
- Flow: file select → `parseBackupJson` → `validateBackup` → modal → confirm → `restoreBackup` (merges `DEFAULT_SETTINGS`, `withProfileDefaults(profile)`) → `settings.load()`.

### DangerZone (`DangerZone.svelte`)

- "Réinitialiser tout" → confirm panel requiring `SUPPRIMER` (exact, case-sensitive). Optional "Créer une sauvegarde avant suppression". Confirm button disabled until matched. → `settings.resetAll()` → bridge `RESET_LOCAL_DATA` → on success: `showResetConfirm=false` + navigate to onboarding.

### Source health (`SourceHealthPanel.svelte`, `ConnectorHealthCard.svelte`, `ConnectorStatus.svelte`)

- Compact (chips) + expanded (rows) modes. Per-source diagnosis derived from session status + `deriveHealthStatus(snapshot)` + mission count. Toggle connector, filter by source, reconnect, recheck. `ConnectorHealthCard`: circuit badge + diagnosis (open=incident, half-open=attention, consecutiveFailures>0=instable, totalCalls=0=not probed, failureRate≥30%=degraded, else reliable).
- Core: `circuit-breaker.ts` (computeNextHealth, shouldAttemptProbe, transitionToHalfOpen), `derive-health-status.ts`, `health-metrics.ts` (percentile, failureRate).

### Export menu (`ExportMenu.svelte`)

- Dropdown with include-description checkbox, date-format select (locale/iso/relative), JSON/CSV/Markdown. Dynamic import of core export. Click-outside close.
- **Note: `ExportMenu` is not imported/used anywhere in the app** (grep finds only its own definition). SettingsPage uses its own inline export buttons instead. Effectively orphaned.

### Cross-cutting

- Toasts: `ToastStore` (`src/lib/state/toast.svelte.ts`, MAX_TOASTS=5, auto-dismiss timers), `ToastContainer.svelte`, `toast-service.ts` singleton + bridge fallback. Toast w/ action (undo).
- Premium: global `premium` store (`premium.svelte.ts`) gates cv/applications/tjm in `App.svelte`; `SettingsPageController.premiumEnabled` is a separate local copy for the "Plan" label.
- Connection: singleton store (`connection-singleton` → `connection.svelte.ts`), states unknown/online/offline/reconnecting(500ms)/slow. Offline banner in App + OfflineNotice molecule.
- Keyboard shortcuts help (`KeyboardShortcutsHelp.svelte`): modal grouped by category, Escape/backdrop close. Feed tour overlay (`FeedTourOverlay.svelte`): step card w/ progress dots.

---

## 2. Acceptance criteria (documented behavior)

- **AC-Settings-01**: Settings page is free (no premium lock); all 4 sections reachable via anchor scroll. ✅ (code confirms no premium gate on `settings`).
- **AC-Scan-01**: autoScan toggle persisted; interval control non-interactive when autoScan off. ✅ (`pointer-events-none` + message).
- **AC-Scan-02**: scan interval bounded 5–120, step 5; persisted via `setSettings`. ✅
- **AC-Alerts-01**: alert preferences saved with undo toast; pause/resume reflected in summary. ✅
- **AC-AI-01**: AI status surfaced; fallback to base score when unavailable; non-blocking. ✅
- **AC-Theme-01**: theme choice persisted; `system` follows OS; cross-module sync via CustomEvent. ✅
- **AC-Backup-01**: invalid JSON → `INVALID_JSON` error in modal; schema mismatch → `SCHEMA_ERROR`; version>1 → `VERSION_UNSUPPORTED`. ✅ (covered by tests + code).
- **AC-Backup-02**: restore requires typing `RESTAURER`; impact warning shown; on confirm overwrites profile/settings/favorites/hidden. ✅
- **AC-Backup-03**: create backup blocked when no profile (`'Veuillez configurer votre profil…'`). ✅
- **AC-Reset-01**: reset requires typing `SUPPRIMER`; irreversible warning; optional pre-backup; navigates to onboarding on success. ✅ (confirmation enforced; **not executed** during QA).
- **AC-Health-01**: healthy/degraded/broken derived from circuit state + consecutive failures; probe interval respected. ✅ (tests pass).
- **AC-Toast-01**: max 5 toasts, auto-dismiss, action toast dismisses on action click. ✅
- **AC-Premium-01**: cv/applications/tjm locked when premium off (lock screen CTA → settings); rendered when premium on. ✅
- **AC-Offline-01**: offline surfaced (App banner + OfflineNotice); reconnect goes through 500ms `reconnecting`. ✅

---

## 3. Edge cases (bounded)

- **Backup — invalid JSON**: `parseBackupJson` → `INVALID_JSON`, modal error branch. ✅
- **Backup — partial/schema error**: Zod `safeParse` → `SCHEMA_ERROR` w/ issues count. ✅
- **Backup — unsupported version (2)**: `VERSION_UNSUPPORTED` with version number. ✅
- **Backup — old backup missing `theme`**: schema `.default('system')` + restore merges `DEFAULT_SETTINGS`. ✅
- **Backup — empty favorites/hidden**: accepted (empty records). ✅
- **Restore — no pending backup**: `restoreBackup` returns error `'Aucune sauvegarde à restaurer'`. ✅
- **Reset — no data**: `resetLocalData` clears idempotently → `reset:true`. ✅ (analysis; not executed).
- **Reset — IndexedDB blocked**: rejects → `LOCAL_DATA_RESET {reset:false, reason}` → controller throws → **silently swallowed** (see Bug-2).
- **Theme — rapid toggle**: each click dispatches event + persists; last write wins. No debounce; acceptable.
- **Theme — persistence**: loaded in `theme.init()` from settings; survives reload. ✅
- **Offline→online**: 500ms reconnecting window; toast "Connexion restaurée". ✅
- **Premium off on gated page**: lock screen overlays; page not mounted. ✅
- **Scan interval extremes**: clamped by range attrs (5/120). ⚠️ `handleScanIntervalChange` does `Number.parseInt(value,10)` with no NaN guard (range always provides a value, so low risk).
- **Alert score range**: 40–95 (caps below 100; design choice).
- **Toast flood**: capped at 5 (oldest dropped). ✅
- **Circuit breaker**: failureThreshold default 5, probeInterval 5min, latency window 100. ✅ (tests).

---

## 4. Suspected bugs

### Bug-1 — BackupRestoreModal: `isRestoring` stuck forever after a failed restore

- **Severity**: medium
- **Evidence**: `src/ui/molecules/BackupRestoreModal.svelte:19-25, 194-208`; caller `src/ui/pages/SettingsPage.svelte:156-164`; `restoreBackup` `src/lib/state/settings-page.svelte.ts:651-677`.
- **Concept**: `handleConfirm()` sets `isRestoring=true` then calls `onConfirm()` (async `handleRestoreBackup`). On failure, `handleRestoreBackup` shows an error toast and `return`s **without closing the modal** (`showBackupModal` stays true). The modal's local `isRestoring` is never reset to `false`, so the primary button keeps the `loader-2` spinner + "Restauration..." label and stays `disabled`. The user must press "Annuler" and re-pick the file to retry. (On success the modal unmounts, so the bug only appears on the failure path.)
- **Needs interactive confirmation**: yes (trigger a restore failure — e.g. simulated storage error).

### Bug-2 — `RESET_LOCAL_DATA` failure is swallowed silently (no user feedback)

- **Severity**: medium
- **Evidence**: `src/lib/state/settings-page.svelte.ts:521-536` (`resetAll` catch block is empty `// Hors contexte extension`); caller `SettingsPage.svelte:1017` ignores the returned promise/result.
- **Concept**: If the service worker returns `LOCAL_DATA_RESET {reset:false, reason}` or the bridge throws, `resetAll` catches and does nothing: no toast, `showResetConfirm` stays `true` (so the panel remains open, which is the only implicit signal). In a real extension context (vs dev stubs) the user gets no error message. The thrown `Error(reason)` is constructed but never surfaced.
- **Needs interactive confirmation**: yes (force a reset failure in a non-dev context).

### Bug-3 — `KeyboardShortcutsHelp` uses `$derived(() => …)` returning a function (non-reactive / non-idiomatic)

- **Severity**: low
- **Evidence**: `src/ui/molecules/KeyboardShortcutsHelp.svelte:12-40` (`const shortcutsByCategory = $derived(() => {...})`) then `:93` calls `shortcutsByCategory()`.
- **Concept**: `$derived(expr)` stores the arrow function itself as the derived value (no `$derived.by`), so the grouping has no reactive dependencies and is computed effectively once. Functionally OK today because shortcuts register once at startup, but it diverges from the project's `$derived.by` idiom (used elsewhere, e.g. SettingsPage) and will silently fail to refresh if shortcuts ever become dynamic.
- **Needs interactive confirmation**: no.

### Bug-4 — `FeedTourOverlay` "Suivant/Terminer" button uses undefined color token `text-text-900`

- **Severity**: low (cosmetic / contrast)
- **Evidence**: `src/ui/molecules/FeedTourOverlay.svelte:65` (`… bg-blueprint-blue/88 … text-text-900`). The `@theme` only defines `--color-text-primary/secondary/muted/subtle` (see AGENTS.md design reference + `design-tokens.css`); there is no `--color-text-900`.
- **Concept**: `text-text-900` resolves to no utility, so the button label inherits the ambient text color (near-black) on a blue background → not the intended look and likely poor contrast. Should probably be `text-white`.
- **Needs interactive confirmation**: yes (visual check on the tour overlay).

### Bug-5 — `migrateBackup` is dead code; restore skips migration

- **Severity**: low
- **Evidence**: `src/lib/core/backup/backup.ts:158-175` (`migrateBackup` defined, never imported/called — grep confirms only the definition). `restoreBackup` (`settings-page.svelte.ts:651-677`) merges `DEFAULT_SETTINGS` instead.
- **Concept**: Only backup v1 exists today, so no functional impact. But the migration hook is unused; future version bumps will silently bypass migration unless wired in. Either delete `migrateBackup` or call it in `restoreBackup`/`validateBackup`.
- **Needs interactive confirmation**: no.

### Bug-6 — `theme.svelte.ts` leaks event listeners (no destroy / ignored unsubscribe)

- **Severity**: low
- **Evidence**: `src/lib/state/theme.svelte.ts:42-63` — `media.addEventListener('change', …)` and `window.addEventListener('mp:theme-changed', …)` are never removed; `subscribeMessages(...)` return value is discarded.
- **Concept**: `init()` has no teardown. Acceptable for a single long-lived store, but if `createThemeStore()` is ever re-instantiated (e.g. HMR, tests) listeners accumulate. No `destroy()` exposed, unlike connection/toast stores.
- **Needs interactive confirmation**: no.

### Bug-7 — `ConnectorStatus` relative-time shows "il y a 0min" for sub-minute deltas

- **Severity**: low (UX inconsistency)
- **Evidence**: `src/ui/molecules/ConnectorStatus.svelte:43-60` — `minutes < 1` returns `'il y a 0min'`, whereas `SourceHealthPanel.svelte:57` and `ConnectorHealthCard.svelte:44` return `"à l'instant"` for the same case.
- **Concept**: Inconsistent "just now" labeling across the three health/status molecules.
- **Needs interactive confirmation**: no.

### Bug-8 — `ScanSettings` interval range is only visually disabled (a11y / keyboard)

- **Severity**: low
- **Evidence**: `src/ui/organisms/ScanSettings.svelte:60-89` — when `autoScan` is false the wrapper gets `opacity-40 pointer-events-none`, but the `<input type="range">` has no `disabled` attribute and no `aria-disabled`.
- **Concept**: Keyboard / assistive-tech users can still focus and change the range value when autoScan is off (pointer-events doesn't affect keyboard). The `onchange` would still fire and persist a scan interval that autoScan won't use.
- **Needs interactive confirmation**: yes (keyboard-only interaction).

### Bug-9 — `ExportMenu` is orphaned / unused; toggle button has identical bg + hover

- **Severity**: low
- **Evidence**: `src/ui/molecules/ExportMenu.svelte:66` (`bg-subtle-gray … hover:bg-subtle-gray` — no hover feedback). Grep shows `ExportMenu` is imported nowhere; SettingsPage uses inline export buttons instead.
- **Concept**: Dead component (maintenance burden) + minor cosmetic hover issue if it were used.
- **Needs interactive confirmation**: no.

### Bug-10 — Two sources of truth for premium status can transiently diverge

- **Severity**: low
- **Evidence**: Global store `src/lib/state/premium.svelte.ts` (used by `App.svelte` gating) vs `SettingsPageController.premiumEnabled` (`settings-page.svelte.ts:128,240`, used for the "Plan" label at `SettingsPage.svelte:685`).
- **Concept**: Both read `getPremium()` independently; toggling premium elsewhere updates only the global store unless SettingsPage is reloaded. The Settings "Plan" badge can briefly disagree with the actual gating state. Reconverges on next `load()`.
- **Needs interactive confirmation**: yes (toggle premium from another surface while Settings is open).

---

## 5. Notes / positive observations

- Functional Core purity is respected in `health/*` and `backup/*` (no I/O, `now` injected). Unit tests are mock-free for core. ✅
- Svelte 5 runes used consistently (`$state/$derived/$effect/$props`, `$derived.by` for complex derivations); no legacy stores/export let. ✅
- Backup validation is robust (version guard before Zod, friendly typed errors). Toasts capped + undo action works. Connection state machine well-tested.
- No `any` observed in domain files; strict TS compliance holds.

## 6. Out of scope / not validated

- Did not run the Vite dev server or Playwright (per hard constraints). All "needs interactive confirmation" items are code-level suspicions only.
- `AlertBuilderCard` deep logic (smart-notification preview, alert history) leans on the alerts/scoring domain; only surface-level review done here.
- Did not execute `RESET_LOCAL_DATA` (destructive) — only confirmed the confirmation gate and traced the handler.
