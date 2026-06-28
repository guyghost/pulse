# QA Report — Domain: Onboarding

Agent: `domain-onboarding`
Scope: 5-step onboarding wizard (source pick → first scan → criteria → profile → alert → insight), skip/“Passer”, `onboarding_completed` set/clear, reset-to-onboarding, profile save propagation + rescore, transitions (forward/back), empty-profile behaviour.
Method: code-level analysis + Vitest unit tests only (no Vite/Playwright, no commits).
Repo: `/Users/guy/Developer/dev/pulse`, extension at `apps/extension/`.

---

## 1. Inventory

### 1.1 Files in scope

- `src/ui/organisms/OnboardingWizard.svelte` — the wizard UI (steps, inputs, buttons).
- `src/ui/pages/OnboardingPage.svelte` — page that hosts the wizard, owns the `profileMachine` actor and alert-prefs state.
- `src/ui/templates/OnboardingLayout.svelte` — static shell (hero, 3 cards, `{@render content()}`).
- `src/lib/state/onboarding.svelte.ts` — a `createOnboardingStore()` factory (idle/saving/complete/error). **Not actually used by `OnboardingPage`/`OnboardingWizard`** (see §5.6).
- `src/lib/shell/machines/app-lifecycle.machine.ts` — bootstrap + `COMPLETE_ONBOARDING` / `RESET_ONBOARDING` / `PROFILE_UPDATED`.
- `src/lib/shell/machines/profile.machine.ts` — load/edit/save/retry profile state machine.
- `src/lib/state/app-navigation.svelte.ts` — `createAppNavigation()` wraps the lifecycle actor; exposes `navigate`, `completeOnboarding`, `resetToOnboarding`.
- `src/lib/shell/facades/{settings,app-flags,alert-preferences}.facade.ts` — bridge calls.
- `src/lib/core/profile/normalize-profile.ts` — pure normalisation used by the wizard submit.
- `src/lib/core/types/alert-preferences.ts` — `ConnectedAlertPreferences` + defaults + normaliser.
- `src/dev/chrome-stubs.ts` — dev-mode `chrome.*` emulation (incl. onboarding flags + SAVE_PROFILE rescore).
- `src/sidepanel/App.svelte` — wires `OnboardingPage onComplete/onSkip` and `resetToOnboarding`.

### 1.2 The 5 steps (`OnboardingWizard.svelte:13-82`)

| #   | Step id      | Label                 | Primary action                                     | Side effect                                                                         |
| --- | ------------ | --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `understand` | Comprendre Pulse      | “Configurer le radar” → `goNext`                   | none (informational)                                                                |
| 2   | `source`     | Connecter une source  | “Continuer avec {selectedSource}” → `goNext`       | sets local `selectedSource` (Free-Work/LeHibou/Hiway/Collective); **not persisted** |
| 3   | `activity`   | Observer une activité | “Créer une première alerte” → `goNext`             | none (informational)                                                                |
| 4   | `alert`      | Créer une alerte      | “Voir le premier insight” → `saveAlertAndContinue` | **persists** alert prefs via bridge                                                 |
| 5   | `insight`    | Recevoir un insight   | (terminal)                                         | none                                                                                |

Profile form (always rendered below the step card): `#ob-firstname`, `#ob-jobtitle`, `#ob-stack` (+add button), `#ob-location`, `#ob-tjm` (number, default 600).

### 1.3 Buttons / inputs / modals

- Header “Voir le feed” (skip, `aria-label="Passer l’onboarding"`) — `OnboardingWizard.svelte:198-206`.
- Bottom “Sauvegarder mon profil” (submit) — `:493-513`, `disabled={!canSubmit || isSaving}`.
- Bottom “Passer et voir le feed” (skip) — `:515-521`, always enabled.
- Progress dots (5) — `:210-222`, each clickable → `goTo(stepId)` (free forward/back navigation).
- Error block (retry) — `:468-484`, shown when `hasError && errorMessage`.
- No modals; no dialogs.

### 1.4 State machine(s)

- `profileMachine`: `loading → {missing | ready}`; `SUBMIT_PROFILE → saving → ready | error`; `RETRY` (guard `hasDraft`) → saving. (`profile.machine.ts:97-185`)
- `appLifecycleMachine`: `bootstrapping → ready`; events `NAVIGATE`, `COMPLETE_ONBOARDING` (→ feed, sets flag), `RESET_ONBOARDING` (→ onboarding, clears flag), `PROFILE_UPDATED`. (`app-lifecycle.machine.ts:157-200`)

### 1.5 Roles

Onboarding is **free** (no premium gating). Premium is irrelevant here (`PREMIUM_LOCKS` in `App.svelte:40-62` covers cv/applications/tjm only).

---

## 2. Acceptance criteria

**AC-1 — First launch routes to onboarding.**
Given no profile, no first-scan flag, `onboarding_completed=false` → bootstrap resolves `currentPage='onboarding'`, `hasCompletedOnboarding=false`.
Evidence: `app-lifecycle.machine.ts:50-55` (`resolveInitialPage`), test `app-lifecycle-machine.test.ts:67-75`. ✅ covered by unit test.

**AC-2 — Existing profile routes to feed and marks onboarding done.**
Given `loadProfile()` returns a profile → `currentPage='feed'`, `hasCompletedOnboarding=true`.
Evidence: `app-lifecycle.machine.ts:66-68,91-96`; test `:77-85`. ✅ covered.

**AC-3 — Completing the wizard persists the profile and the onboarding flag.**
Given user fills firstName+jobTitle+stack and clicks “Sauvegarder mon profil” → `normalizeProfileDraft` → `onComplete` → `profileMachine` SAVE → on success `onComplete?.()` → `nav.completeOnboarding` → `setOnboardingCompleted()` + `currentPage='feed'`.
Evidence: `OnboardingWizard.svelte:101-118,124-129`; `OnboardingPage.svelte:42-49,67-89`; `app-lifecycle.machine.ts:134-142`; tests `OnboardingWizard.test.ts:102-133`, `profile-machine.test.ts:70-87`. ✅ covered.

**AC-4 — Profile save triggers rescore + `MISSIONS_UPDATED`/`PROFILE_UPDATED` broadcast.**
Evidence: dev stub `chrome-stubs.ts:151-185`; test `profile-save-propagation.test.ts:63-99`. ✅ covered (dev path; production path is the service worker, asserted by the test’s comment to mirror `background/index.ts`).

**AC-5 — Skip (“Passer / Voir le feed”) exits to feed and marks onboarding done.**
Given user clicks either skip button → `onSkip` → `nav.completeOnboarding` → feed + flag set.
Evidence: `OnboardingWizard.svelte:201,517`; `App.svelte:303` (`onSkip={nav.completeOnboarding}`). ⚠️ Not covered by unit test; also see bug B-3 (profile left null).

**AC-6 — Reset-to-onboarding re-enters the wizard and clears the flag.**
Given `RESET_ONBOARDING` → `clearOnboardingCompleted()` + `currentPage='onboarding'`, `hasCompletedOnboarding=false`.
Evidence: `app-lifecycle.machine.ts:143-151`; wired from FeedPage/ProfilePage/SettingsPage `onNavigateToOnboarding={nav.resetToOnboarding}` (`App.svelte:270,390,485`) and DevPanel toggle (`App.svelte:115-121`). ⚠️ No dedicated unit test for RESET_ONBOARDING persistence; machine transition is implicit.

**AC-7 — Alert step persists preferences before advancing.**
Given alert step “Voir le premier insight” → `saveAlertAndContinue` → `onSaveAlertPreferences` (normalise, revision+1, `updatedAt`) → `goNext`.
Evidence: `OnboardingWizard.svelte:151-162`; `OnboardingPage.svelte:55-65`; `alert-preferences.facade.ts:18-37`; test `OnboardingWizard.test.ts:75-100`. ✅ covered, but see bug B-4 (advances even on save failure).

**AC-8 — Stale bootstrap cannot undo a just-completed onboarding.**
Given COMPLETE_ONBOARDING sent while bootstrap in flight → flag stays true, page stays feed after bootstrap resolves null.
Evidence: `app-lifecycle.machine.ts:91-104`; test `app-lifecycle-machine.test.ts:87-110`. ✅ covered.

---

## 3. Edge cases (bounded, risk-based)

| Case                                       | Expected                                  | Observed / risk                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip every step (click skip at step 1)     | Exit to feed, flag set                    | ✅ works; leaves profile `null` (B-3)                                                                                                                                                                            |
| Skip at alert step (before save)           | Exit, no alert saved                      | ✅ expected; alert not persisted                                                                                                                                                                                 |
| Back navigation                            | Return to earlier step                    | Only via progress dots (no Back button). Dots allow jumping forward too — informational steps can be bypassed. Acceptable.                                                                                       |
| Reload mid-wizard                          | Restart at step 1                         | ✅ expected; all wizard state is component-local `$state` (`OnboardingWizard.svelte:45-54`), not persisted → lost on reload. **Alert prefs saved at step 4 persist** (orphaned if profile never saved). See B-7. |
| Incomplete profile persistence             | Partial data not saved until final submit | `onUpdateProfile` never wired in `OnboardingPage` (B-1); partial data lost if wizard unmounts before submit.                                                                                                     |
| Empty profile (stack=[], all blank) + skip | App on feed with `profile=null`           | Scan itself is independent of profile; scoring with null profile is a **feed-domain** risk originating from the skip path (B-3).                                                                                 |
| `tjm` cleared / non-numeric                | Should not crash                          | `normalizeDailyRate` clamps NaN/negative → 0; `tjmMax=tjm+150`. With NaN input → tjmMin=0, tjmMax=0, `ok=true`. Profile saves with 0/0. No crash. ✅                                                             |
| Very large `tjm` (e.g. 1e9)                | Bounded?                                  | Not bounded in wizard; `normalizeDailyRate` only rejects non-finite/negative. Passes through. Low risk.                                                                                                          |
| Duplicate stack entry                      | De-duped                                  | `addStack` guards `!stack.includes(trimmed)` (`:89`); `normalizeProfileDraft.appendUniqueNormalized` also de-dups. ✅                                                                                            |
| Long stack/keyword strings                 | Trimmed                                   | `normalizeTextInput` collapses whitespace; no length cap in `normalize-profile.ts` (alert prefs cap stacks at 40 chars / 12 items in `alert-preferences.ts:38-45`, but profile `stack` is uncapped). Low risk.   |
| Rapid double-submit                        | Prevented                                 | `handleSubmit` guards `if (isSaving) return` + button `disabled` (`OnboardingWizard.svelte:125-129,496`). ✅                                                                                                     |
| Premium on/off                             | N/A                                       | Onboarding has no premium surface. ✅                                                                                                                                                                            |
| Alert threshold extremes (60/95)           | Range input `min=60 max=95 step=5`        | ✅ bounded by input; normaliser clamps 0-100 regardless.                                                                                                                                                         |
| Profile save failure (IndexedDB down)      | Error UI + retry                          | `profileMachine` → `error`; `OnboardingPage` surfaces `hasError`/`errorMessage`; “Réessayer” sends `RETRY` (guard `hasDraft`). ✅ covered by `profile-machine.test.ts:89-114`.                                   |

---

## 4. Test results

Command:

```
cd /Users/guy/Developer/dev/pulse/apps/extension && pnpm exec vitest run \
  tests/unit/ui/OnboardingWizard.test.ts \
  tests/unit/dev/profile-save-propagation.test.ts \
  tests/unit/machines/profile-machine.test.ts \
  tests/unit/machines/app-lifecycle-machine.test.ts
```

Result: **4 files passed, 11/11 tests passed** (1.87s).

- `tests/unit/ui/OnboardingWizard.test.ts` — 3 passed (step sequence, alert save, profile submit normalisation).
- `tests/unit/dev/profile-save-propagation.test.ts` — 1 passed (PROFILE_UPDATED + MISSIONS_UPDATED rescore).
- `tests/unit/machines/profile-machine.test.ts` — 4 passed (missing/ready/save/error+retry).
- `tests/unit/machines/app-lifecycle-machine.test.ts` — 3 passed (route-to-onboarding, route-to-feed, stale-bootstrap guard).

Gaps (no unit coverage): skip path (AC-5), reset-to-onboarding persistence (AC-6), alert-save-failure-then-advance (B-4), `onUpdateProfile` wiring (B-1), reload-mid-wizard.

---

## 5. Suspected bugs

### B-1 — `onUpdateProfile` is never wired; incremental profile updates are silently dropped

- **Severity:** low
- **Evidence:** `OnboardingWizard.svelte:92,98,115` call `onUpdateProfile?.({ stack })` / `onUpdateProfile?.(result.profile)`; `OnboardingPage.svelte:93-103` instantiates `<OnboardingWizard …/>` **without** `onUpdateProfile`. So every `onUpdateProfile` call is a no-op.
- **Impact:** Adding/removing stack chips does not propagate to the page/store. The final submit still works because `handleComplete` recomputes the full profile from local state and calls `onComplete`. The only real loss is if the wizard unmounts before submit (partial data discarded). Also a contract smell: the component advertises incremental updates that never happen.
- **Repro concept:** mount wizard, add a stack chip, assert parent never receives a partial profile update.
- **Needs interactive confirmation:** no (code path is definitive).

### B-2 — `handleComplete` silently no-ops if profile normalisation fails

- **Severity:** low
- **Evidence:** `OnboardingWizard.svelte:101-118` — `if (result.ok && result.profile) { … }` has no `else`. If `normalizeProfileDraft` returns `{ok:false}`, nothing happens: no `onComplete`, no `isSaving`, no error shown. The submit button appears dead.
- **Impact:** With current inputs this branch is unreachable (`tjmMax = tjm+150` always ≥ `tjmMin`, and NaN clamps to 0/0 → ok). Latent fragility if the TJM derivation changes.
- **Repro concept:** hard to reach today; would need `tjmMin > tjmMax` which the fixed `+150` offset prevents.
- **Needs interactive confirmation:** no.

### B-3 — Skip leaves `profile = null`; feed loads with no profile (cross-domain risk)

- **Severity:** medium
- **Evidence:** Skip → `onSkip` → `nav.completeOnboarding` (`App.svelte:303`). `completeOnboarding` (`app-lifecycle.machine.ts:134-142`) sets the flag and page but **never saves a profile**. Bootstrap on next load sees `onboarding_completed=true` → feed, with `profile=null`.
- **Impact:** The user reaches the feed with no profile, so `scoreMission` runs against a null/empty profile (scoring degrades). Whether FeedPage handles `getProfile() → null` gracefully is the feed domain’s responsibility, but the onboarding skip is the origin. Spec says “scan allowed with empty profile?” — scan is allowed, but scoring quality is undefined.
- **Repro concept:** fresh state → open onboarding → click “Passer et voir le feed” → observe feed with `profile=null`.
- **Needs interactive confirmation:** yes (feed behaviour with null profile).

### B-4 — Alert save failure still advances to the insight step

- **Severity:** medium
- **Evidence:** `OnboardingWizard.svelte:151-162` `saveAlertAndContinue` does `await onSaveAlertPreferences?.(...)` then **unconditionally** `goNext()`. `OnboardingPage.svelte:55-65` `handleSaveAlertPreferences` catches errors and shows an error toast but does not throw. So on failure the user sees an error toast **and** still advances to “Recevoir un insight”.
- **Impact:** Confusing UX: the wizard claims the alert is configured (the insight text references the chosen threshold) while persistence failed. The user believes an alert exists when none was saved.
- **Repro concept:** make `saveAlertPreferences` reject (e.g., service worker returns non-saved) → click “Voir le premier insight” → error toast appears AND step advances.
- **Needs interactive confirmation:** yes.

### B-5 — Onboarding flag persistence is fire-and-forget; errors swallowed

- **Severity:** low
- **Evidence:** `app-lifecycle.machine.ts:135` `context.deps.setOnboardingCompleted().catch(() => {})` and `:144` `clearOnboardingCompleted().catch(() => {})`. The machine optimistically flips `hasCompletedOnboarding` regardless of persistence outcome.
- **Impact:** If `setOnboardingCompleted`/`clearOnboardingCompleted` fail (facade throws when the bridge response is wrong — `app-flags.facade.ts:25-37`), the in-memory state diverges from storage: the UI shows feed/onboarding correctly for the session, but on reload the flag reverts. No user feedback.
- **Repro concept:** make the service worker return `{saved:false}` for `SET_ONBOARDING_COMPLETED` → complete onboarding → reload → returns to onboarding despite the session having shown feed.
- **Needs interactive confirmation:** yes.

### B-6 — Dev stub does not persist `onboarding_completed` / `first_scan_done` to localStorage

- **Severity:** low (dev-only)
- **Evidence:** `chrome-stubs.ts:79-108` initialises `onboarding_completed: true`, `first_scan_done: true`, `profile_banner_dismissed: false`, `feed_tour_seen: false` in the in-memory `storage` object only. `SET_ONBOARDING_COMPLETED`/`CLEAR_ONBOARDING_COMPLETED` (`:321-326`) mutate `storage` in memory with **no** `writeDevStorage` call (contrast profile/alerts/missions/favorites which DO persist). On reload the module re-initialises to the defaults.
- **Impact:** In dev, onboarding is hard to reach without the DevPanel (defaults force feed). Toggle via DevPanel works in-session but resets on reload. QA of the reset-to-onboarding / reload flows in dev is unreliable; must use DevPanel or clear `__missionpulse_dev_profile` + the in-memory reset.
- **Repro concept:** DevPanel → toggle onboarding off → reload → onboarding flag is `true` again.
- **Needs interactive confirmation:** no.

### B-7 — Reload mid-wizard loses all step state; alert prefs can be orphaned

- **Severity:** low
- **Evidence:** All wizard state is component-local `$state` (`OnboardingWizard.svelte:45-54`); nothing is persisted between steps except the alert prefs (saved at step 4 via bridge). `selectedSource` (step 2) is never persisted at all.
- **Impact:** Reloading after step 4 but before final profile submit leaves a saved alert preference with no profile and onboarding not completed → restart at step 1, orphaned alert record.
- **Repro concept:** reach alert step → save → reload → wizard restarts at step 1; alert prefs already stored.
- **Needs interactive confirmation:** yes.

### B-8 — `alertThreshold` initial value (80) disagrees with default prefs (70)

- **Severity:** low (cosmetic / latent)
- **Evidence:** `OnboardingWizard.svelte:52` `let alertThreshold = $state(80)`, but `DEFAULT_CONNECTED_ALERT_PREFERENCES.scoreThreshold = 70` (`alert-preferences.ts:18`). The `$effect` at `:143-149` overwrites 80→70 on first run (revision -1 → 1), so the rendered default is 70, matching the test. The literal `80` is dead/misleading.
- **Impact:** None functionally (effect reconciles), but the magic number invites future confusion if the effect is removed.
- **Needs interactive confirmation:** no.

### B-9 — `submitProfile` resolves on the first `ready && current` transition; fragile if machine is already `ready`

- **Severity:** low
- **Evidence:** `OnboardingPage.svelte:67-89` subscribes then sends `SUBMIT_PROFILE`, resolving when `snapshot.matches('ready') && snapshot.context.current`. XState v5 `subscribe` does not emit the current snapshot synchronously, so the happy path works (covered by `profile-machine.test.ts`). However, if the actor were already `ready` with a `current` profile and subscription semantics ever emitted the initial snapshot, `submitProfile` would resolve immediately without saving.
- **Impact:** No current bug; latent fragility worth a guard (e.g., only resolve on a transition that follows `saving`).
- **Needs interactive confirmation:** no.

---

## 6. Notes / observations

- `src/lib/state/onboarding.svelte.ts` (`createOnboardingStore`) appears **unused** by the live onboarding UI (the page uses `profileMachine` directly). It is likely legacy or intended for a different consumer; if unused, consider removal to avoid confusion. (Not counted as a bug.)
- `OnboardingLayout.svelte` is a pure presentational shell — no logic, no issues.
- The wizard hardcodes `remote:'any'`, `seniority:'senior'`, `tjmMax = tjm+150`, `searchKeywords:[]` (`OnboardingWizard.svelte:108-111`) — product decision, not a bug, but the user cannot set remote/seniority during onboarding.
- No Svelte 4 patterns, no `any`, no `Date.now()` in core normaliser — `normalize-profile.ts` is pure and compliant with AGENTS.md. `alert-preferences.facade.ts:24` uses `new Date().toISOString()` (Shell) — compliant.
