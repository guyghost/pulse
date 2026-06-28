# QA Report — Domain: Profile + CV (canonical profile)

Agent: `domain-profile-cv`
Scope: profile view/edit, save→rescore+broadcast, completeness radar, LinkedIn read/verify, CV copy/open + "Pousser", account-pending state, premium gating on CV, plus profile-extractors (LinkedIn parser/extractor/registry), normalize-profile, profile-db, profile-validation.
Method: code-level analysis + unit tests only. No Vite dev server, no Playwright (per constraints).
Date: 2026-06-27

---

## Summary

- **Unit tests:** 8 files / 51 tests — **all pass** (0 failures).
- **Top suspected bugs:**
  1. **[high]** LinkedIn preview/import/sync messages are **not stubbed in dev** → `previewLinkedIn`/`importLinkedIn` always error with `unexpected_response` in the dev app.
  2. **[high]** `SYNC_LINKEDIN_PROFILE_IMPORT` is **hard-coded to fail** in the production service worker → the CV "Enregistrer comme source" action can never succeed.
  3. **[med]** CV clipboard calls (`copyPayload`/`pushPlatform`/`pushAll`) lack error handling → unhandled rejections + silent UI failure when clipboard is denied/unfocused.
- **Verified working:** profile save → rescore + `MISSIONS_UPDATED` broadcast (prod + dev); profile Zod validation (robust); premium gating on CV; weighted completeness radar math.

---

## 1. Inventory

### 1.1 Profile page (`src/ui/pages/ProfilePage.svelte`)

- Route/page: `profile` (free, always visible). Rendered in `src/sidepanel/App.svelte:379-409`, guarded by a `svelte:boundary`.
- Controller: `SettingsPageController` (`src/lib/state/settings-page.svelte.ts`) — owns `$state` for all fields, profile XState actor (`profile.machine`), save/normalize logic.
- Inputs (edit mode, `src/ui/organisms/ProfileSection.svelte`): firstName, jobTitle, profileLocation, profileRemote (select), seniority (select), tjmMin (number), tjmMax (number), stackInput + add/remove, keywordInput + add/remove.
- Buttons: edit toggle (`onToggleEdit`), "Enregistrer le profil" (`onSave`), add stack, add keyword, chip remove; priority impact cards (`openProfileEditing`); OperationalStoryCard primary action (save or toggle edit depending on state).
- States: `editingProfile` (bool), `isSavingProfile` (actor `saving`), `profileSaved` (2s flash), `profileError` (string|null).
- Radar %: `profileCompleteness` derived from `buildProfileImpactSimulation` (`src/lib/core/profile/profile-impact.ts`). Weights: stack 25, tjm-min 20, remote 15, location 15, search-keywords 10, job-title 8, tjm-max 5, first-name 2 (sum 100).

### 1.2 CV page (`src/ui/pages/CvPage.svelte`)

- Route/page: `cv` — **Premium-gated**. Rendered only when `nav.currentPage === 'cv' && premium.isPremium` (`src/sidepanel/App.svelte:410`). When not premium, a lock empty-state is shown (`App.svelte:323-344`, `PREMIUM_LOCKS.cv`).
- Local state: `profile`, `isLoading`, `selectedPlatformId`, `pushedPlatformIds` (Set), `verifyingPlatformId`, `previewingLinkedIn`, `syncingLinkedIn`, `linkedInPreviewResult`, `linkedInImportResult`, `verificationResults` (Map), `selectedFieldIds` (default `['title','summary','stack','location','remote','tjm']`).
- Fields shown (syncFields): title, summary, stack, location, remote, tjm, keywords. `profileCompleteness = round(readyFields / syncFields * 100)`.
- Buttons/actions: "Tout préparer"/"Compléter le profil" (`handleSourceAction`), field toggles (`toggleField`), "Copier" (`copyPayload`), platform "Vérifier" (`verifyPlatform`), "Copier et ouvrir" (`pushPlatform`), external-link `<a>`, "Prévisualiser LinkedIn" (`previewLinkedIn`), "Enregistrer comme source" (`confirmLinkedInSync`), "Relire LinkedIn".
- Platforms: LinkedIn (social, manual) + connectors from `getConnectorsMeta()`.
- Live updates: subscribes to `PROFILE_UPDATED` and re-fetches profile (`CvPage.svelte:516-530`).

### 1.3 Profile completeness banner / radar

- `ProfilePage` computes `missingProfileItems`, `completionExplanation`, `profileStory` (severity/title), `topProfilePriorities` (top 3 missing). Banner bar width = `profileCompleteness%`.
- Separate molecule `src/ui/molecules/ProfileRefinementBanner.svelte` (feed-level banner, dismissible via `setProfileBannerDismissed`) — not rendered by ProfilePage itself; uses its own `completion`/`missingItems` props.

### 1.4 LinkedIn verification + import (canonical profile)

- **Two `verifyProfilePage` implementations** (intentional split, not a bug):
  - UI facade `src/lib/shell/facades/profile-sync.facade.ts:15-37` → sends `VERIFY_PROFILE_PAGE` over the bridge.
  - Service-worker side `src/lib/shell/profile/profile-page-verification.ts` (direct `fetch`) — used by `background/index.ts:77,792`. Unit-tested directly.
- LinkedIn extraction: `LinkedInProfileExtractor` (`src/lib/shell/profile-extractors/linkedin.extractor.ts`) → `parseLinkedInProfilePayload` (`src/lib/core/profile-extractors/linkedin-parser.ts`) → `normalizeCandidateProfile` (`src/lib/core/profile-extractors/normalize-candidate-profile.ts`).
- Bridge messages (all in `src/lib/shell/messaging/bridge.ts:126-142`, Zod-validated in `schemas.ts:634-686`): `VERIFY_PROFILE_PAGE`, `PREVIEW_LINKEDIN_PROFILE`, `SYNC_LINKEDIN_PROFILE_IMPORT`, `IMPORT_LINKEDIN_PROFILE`.

### 1.5 Persistence

- `getProfile`/`saveProfile` facade `src/lib/shell/facades/settings.facade.ts` → bridge → SW `background/index.ts:376-410` → IndexedDB (`src/lib/shell/storage/db.ts`).
- Zod schema `UserProfileSchema` (`src/lib/core/types/schemas.ts`, exercised by `profile-validation.test.ts`).

---

## 2. Acceptance criteria

### Profile view/edit

- **AC-P1** Given a stored profile, When the user opens `profile`, Then fields render in read-only mode with placeholders for empties (`ProfileSection.svelte:253-300`).
- **AC-P2** Given edit mode, When the user toggles the edit button, Then the form appears and `editing` icon flips to `x` (`ProfileSection.svelte:88-96`).
- **AC-P3** Given invalid TJM (min>max), When saving, Then `profileError` = "Le TJM maximum doit être supérieur ou égal au TJM minimum" and no save occurs (`settings-page.svelte.ts:397-400`; `normalize-profile.ts:64-66`).
- **AC-P4** Given a successful save, When the actor transitions `saving→ready`, Then `profileSaved` flashes for 2s, edit mode exits, and a success toast shows (`settings-page.svelte.ts:432-436`; `ProfilePage.svelte:135-143`).

### Save → rescore + broadcast

- **AC-R1** Given a profile save, Then stored missions are re-scored against the new profile and `MISSIONS_UPDATED` is broadcast, followed by `PROFILE_UPDATED`.
  - Prod: `background/index.ts:383-410` (`saveProfile` → `rescoreStoredMissions` → `sendMessage MISSIONS_UPDATED` → `PROFILE_UPDATED`).
  - Dev: `src/dev/chrome-stubs.ts:151-185` mirrors this (rescore via `scoreMission` + `emitRuntimeMessage`).
- **AC-R2** Given `PROFILE_UPDATED`, Then `SettingsPageController` (`settings-page.svelte.ts:149-159`) and `CvPage` (`CvPage.svelte:516-530`) re-apply/reload the profile.

### Completeness radar

- **AC-C1** Given all 8 impact fields complete, Then radar = 100% and story severity = `success` (`profile-impact.test.ts:65-85`).
- **AC-C2** Given exactly one missing field, Then radar = 100 − weight(field) (e.g., missing first-name → 98%; missing mots-clés → 90%) and `missingProfileItems.length === 1` (`profile-impact.test.ts:50-63`).
- **AC-C3** Given 0 fields, Then radar = 0%, top 3 priorities = stack/tjm-min/remote, simulated delta = 60 (`profile-impact.test.ts:50-63`).

### LinkedIn verify (dev)

- **AC-L1** Given dev mode, When the user clicks "Vérifier" on LinkedIn, Then the result is `read.status === 'blocked'` and a toast "LinkedIn: lecture bloquée, vérification manuelle" shows (`chrome-stubs.ts:194-204`; `CvPage.svelte:363-366`). ✓ matches task note.

### CV copy/open + Pousser (OPEN_EXTERNAL_URL)

- **AC-V1** Given selected fields, When "Copier" is clicked, Then `selectedPayload` is written to the clipboard and a success toast shows (`CvPage.svelte:338-341`).
- **AC-V2** Given a platform "Copier et ouvrir", Then the per-platform payload is copied, `pushedPlatformIds` adds the id, `openExternalUrl(profileUrl)` is invoked (→ `OPEN_EXTERNAL_URL` message), and a toast shows (`CvPage.svelte:343-348`).
- **AC-V3** Given "Tout préparer" with a profile, Then all platforms are marked pushed and the shared payload is copied (`pushAll`, `CvPage.svelte:468-476`).

### Account-pending state

- **AC-A1** Given no connected account / not premium, Then CV shows the Premium lock empty-state, not CvPage (`App.svelte:323-344,410`).
- **AC-A2** CvPage workflow step 3 ("Dashboard connecté") is always `state: 'locked'`, statusLabel "Compte requis" — represents account-pending (`CvPage.svelte:281-290`).

### Premium gating on CV

- **AC-G1** Given `premium.isPremium === false`, When navigating to `cv`, Then `lockedPremiumPage` renders the lock card and CvPage is not mounted (`App.svelte:66-72,323-344,410`).
- **AC-G2** Given dev defaults (`premium_enabled: true`, `chrome-stubs.ts:102`) and `premium.load()` on mount (`App.svelte:29-31`), Then CV is unlocked in dev. ✓

---

## 3. Edge cases (bounded, risk-based)

- **Empty stack / keywords:** adding trimmed-empty is ignored (`settings-page.svelte.ts:358-366, 372-380`); radar treats length 0 as incomplete.
- **tjmMin > tjmMax:** rejected pre-save (`settings-page.svelte.ts:397-400`) and by Zod (`profile-validation.test.ts:65-73`).
- **tjmMin>0, tjmMax=0:** accepted (max unset) — by design (`profile-validation.test.ts:75-79`).
- **Negatives / NaN in number inputs:** `normalizeDailyRate` clamps `<0`/non-finite to 0 (`normalize-profile.ts:29-35`); Zod rejects negatives on persisted shape, but save normalizes first so negatives never persist.
- **Very long keyword / firstName>50 / stack>20:** Zod rejects (`profile-validation.test.ts:43-47,81-98`); UI inputs have no `maxlength` attribute (minor hardening gap — see notes).
- **Duplicates:** stack/keyword add dedupes via `appendUniqueNormalized` — but **case-sensitive** (see Bug 6).
- **Missing all fields:** radar 0%, story `incident`, priorities shown.
- **profile === null (CV):** `OperationalEmptyState` "Source manquante" + cvStory `incident` (`CvPage.svelte:210-221,695-711`); `buildSummary`/`formatRemote` guard null.
- **LinkedIn blocked (dev):** verify returns `blocked` (AC-L1).
- **LinkedIn rate-limit/challenge:** extractor maps checkpoint/challenge DOM → `rate_limited_or_blocked` (`linkedin-extractor.test.ts:194-234`).
- **Premium off:** CV locked (AC-G1).
- **Rapid clicks:** save guarded by `isSavingProfile` (`ProfilePage.svelte:136-138`); verify button disabled while `verifyingPlatformId !== null` (`CvPage.svelte:976`); preview/sync buttons disabled while in flight (`CvPage.svelte:815,823`).
- **Large lists:** platform list bounded by connectors; skills preview sliced to 8 (`CvPage.svelte:803`); experiences sliced to 20 in DOM extractor (`linkedin.extractor.ts:116`).

---

## 4. Test results

Command: `cd apps/extension && pnpm exec vitest run <8 files>` (domain-only).

| File                                                     | Tests  | Result                  |
| -------------------------------------------------------- | ------ | ----------------------- |
| tests/unit/profile/normalize-profile.test.ts             | 5      | PASS                    |
| tests/unit/profile/profile-impact.test.ts                | 4      | PASS                    |
| tests/unit/profile/profile-page-verification.test.ts     | 3      | PASS                    |
| tests/unit/profile-extractors/linkedin-extractor.test.ts | 12     | PASS                    |
| tests/unit/profile-extractors/linkedin-parser.test.ts    | 5      | PASS                    |
| tests/unit/profile-extractors/registry.test.ts           | 4      | PASS                    |
| tests/unit/storage/profile-db.test.ts                    | 1      | PASS                    |
| tests/unit/storage/profile-validation.test.ts            | 17     | PASS                    |
| **Total**                                                | **51** | **8 files, 0 failures** |

Note: `profile-page-verification.test.ts` exercises the **service-worker-side** module (`src/lib/shell/profile/profile-page-verification.ts`, fetch-based). The CvPage actually calls the **facade** version (`profile-sync.facade.ts`) which delegates to the SW over the bridge; the `available`/`auth-required`/`blocked` branches are therefore only covered by this unit test, not exercisable in the running dev app (dev chrome-stubs hard-codes `blocked`).

---

## 5. Suspected bugs

### Bug 1 — LinkedIn preview/import/sync not stubbed in dev (always `unexpected_response`)

- **Severity:** high
- **Evidence:** `src/dev/chrome-stubs.ts` `sendMessage` switch has **no cases** for `PREVIEW_LINKEDIN_PROFILE`, `IMPORT_LINKEDIN_PROFILE`, or `SYNC_LINKEDIN_PROFILE_IMPORT` (grep in `src/dev/chrome-stubs.ts` → 0 matches). They fall through to `default: ... return null` (`chrome-stubs.ts:498-500`). The facade then returns `{ extracted: false, errorCode: 'unexpected_response', errorMessage: "L'extraction LinkedIn n'a pas renvoyé de preview exploitable." }` (`src/lib/shell/facades/profile-sync.facade.ts:53-65`).
- **Impact:** In the dev app, every LinkedIn action on the CV page fails:
  - "Prévisualiser LinkedIn" (`CvPage.svelte:379-394`) → red card + error toast.
  - "Importer LinkedIn" empty-state primary action (`CvPage.svelte:704-710`) and cvStory primary actions (`CvPage.svelte:218-220,243-245,255-257`) → same failure.
  - "Enregistrer comme source" (`confirmLinkedInSync`, `CvPage.svelte:400-419`) → `unexpected_response` in dev.
- **Reproduction:** dev app → CV → click "Prévisualiser LinkedIn" → toast "LinkedIn: L'extraction LinkedIn n'a pas renvoyé de preview exploitable." and an orange `unexpected_response` card.
- **Needs interactive confirmation:** Yes (to observe toast/card), but the root cause is code-certain. Fix: add dev stubs returning a mock `CanonicalCandidateProfileDraft` for `PREVIEW_LINKEDIN_PROFILE`/`IMPORT_LINKEDIN_PROFILE` (and a success path for `SYNC_LINKEDIN_PROFILE_IMPORT`), mirroring the `VERIFY_PROFILE_PAGE` stub.

### Bug 2 — `SYNC_LINKEDIN_PROFILE_IMPORT` always fails in production

- **Severity:** high
- **Evidence:** `src/background/index.ts:832-842`:
  ```
  if (message.type === 'SYNC_LINKEDIN_PROFILE_IMPORT') {
    sendResponse({ type: 'LINKEDIN_PROFILE_IMPORTED',
      payload: { imported: false, errorCode: 'sync_unavailable', errorMessage: 'Sync not available' } });
    return false;
  }
  ```
- **Impact:** The CV "Enregistrer comme source" button (`CvPage.svelte:400-419`) can **never** succeed in production, even after a valid preview. The user always gets an orange error card + toast "LinkedIn: Sync not available". The preview→persist flow is effectively a dead end.
- **Reproduction:** (production, or dev after Bug 1 stub added) preview LinkedIn successfully → click "Enregistrer comme source" → always fails with `sync_unavailable`.
- **Needs interactive confirmation:** No (code-certain). Confirm with product whether this is intended as "dashboard connecté (compte requis)" not-yet-built; if so, the button should be disabled/hidden until account is connected rather than presenting a perpetually-failing action.

### Bug 3 — CV clipboard calls lack error handling (unhandled rejections, silent failure)

- **Severity:** med
- **Evidence:** `src/ui/pages/CvPage.svelte`:
  - `copyPayload` (338-341): `await navigator.clipboard.writeText(...)` then toast — no try/catch.
  - `pushPlatform` (343-348): only `openExternalUrl(...).catch(() => {})` is guarded; the preceding `navigator.clipboard.writeText` is not.
  - `pushAll` (468-476): same pattern.
  - All three are async functions invoked from `onclick`/action handlers without awaiting the returned promise.
- **Impact:** If `navigator.clipboard.writeText` rejects (permission denied, document not focused, insecure context), the promise rejects unhandled; the success toast never fires and `pushedPlatformIds` is not updated → the platform status badge stays "À vérifier" with no user feedback.
- **Reproduction:** dev CV → conditions where clipboard write rejects (e.g., unfocused frame / denied permission) → click "Copier" / "Copier et ouvrir" → no toast, badge unchanged, console shows unhandled rejection.
- **Needs interactive confirmation:** Yes.

### Bug 4 — Dead code: `importLinkedInProfile` facade + `IMPORT_LINKEDIN_PROFILE` handler unreachable; handler double-extracts

- **Severity:** low
- **Evidence:**
  - `importLinkedInProfile` is exported from `src/lib/shell/facades/profile-sync.facade.ts:39-51` but has **no importers** in `src/ui` (grep `src/ui` → 0 matches). It is the only sender of `IMPORT_LINKEDIN_PROFILE`.
  - The SW `IMPORT_LINKEDIN_PROFILE` handler (`background/index.ts:844-888`) calls `previewLinkedInProfile(startedAt, tabId)` twice (line 846 to validate, line 860 to build the response) → two `chrome.scripting.executeScript` DOM injections per import (wasted work + extra rate-limit exposure on LinkedIn).
- **Impact:** Maintainability; latent rate-limit risk if the dead path is ever wired up.
- **Reproduction:** N/A (unreachable from UI).
- **Needs interactive confirmation:** No.

### Bug 5 — No-op seniority ternary in `buildSummary`

- **Severity:** low
- **Evidence:** `src/ui/pages/CvPage.svelte:298` — `const seniority = value.seniority === 'senior' ? 'senior' : value.seniority;` (both branches yield `value.seniority`).
- **Impact:** Dead logic; no functional effect.
- **Needs interactive confirmation:** No.

### Bug 6 — Profile stack/keyword dedupe is case-sensitive

- **Severity:** low
- **Evidence:** `appendUniqueNormalized` (`src/lib/core/profile/normalize-profile.ts:37-45`) builds a `Set` from `normalizeTextInput` output, which only trims + collapses whitespace (no lowercasing, `normalize-profile.ts:26-27`). The LinkedIn normalizer (`normalize-candidate-profile.ts:72-87` `uniqueTexts`) _does_ lowercase for dedupe — inconsistent. Zod (`profile-validation.test.ts:100-104`) rejects empty entries but not case duplicates.
- **Impact:** User can add `React` and `react` (or `SaaS`/`saas`) as two distinct stack chips / search keywords.
- **Reproduction:** Profile edit → add "React", then "react" → two chips persist after save.
- **Needs interactive confirmation:** Yes.

### Bug 7 — ProfilePage story severity vs radar % minor inconsistency

- **Severity:** low
- **Evidence:** `src/ui/pages/ProfilePage.svelte:102-133`. The `success` story branch requires `missingProfileItems.length === 0`. If only `first-name` (weight 2) is missing, radar = 98% and the "Complétude" evidence is `success` (98≥85), but the overall story takes the else branch → severity `attention` (98≥55) / statusLabel "À compléter".
- **Impact:** Green 98% radar alongside an amber "À compléter" story card.
- **Needs interactive confirmation:** Yes.

### Bug 8 — `compareProfileText` substring matching can false-positive

- **Severity:** low
- **Evidence:** `src/lib/core/profile/profile-sync.ts:39-56` — status is `match` when `normalizedText.includes(normalizedExpected)`. Short/common values (e.g., "Paris", "Lead", "SaaS") match if they appear anywhere on the platform page.
- **Impact:** Verification may report a field as aligned when its value coincidentally appears elsewhere on the page.
- **Needs interactive confirmation:** Yes (moot in dev where verify is hard-coded `blocked`).

---

## 6. Notes / hardening gaps (not bugs)

- Profile/CV text inputs (`ProfileSection.svelte` firstName/jobTitle/location/stack/keyword, `CvPage` none-editable) have no `maxlength`; rely on Zod rejection at save. Consider client-side caps to match schema (firstName ≤50, stack ≤20).
- `normalizeDailyRate` accepts arbitrarily large finite numbers pre-Zod (Zod caps tjm ≤5000 on persist). Live radar could briefly reflect an out-of-range value before save; harmless.
- `profile-page-verification.ts` (SW side) is well covered by unit tests (available/auth-required/blocked); ensure the facade↔SW wiring stays in sync if the SW module signature changes.
