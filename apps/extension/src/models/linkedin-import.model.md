# LinkedIn Import Model

Source of truth for the LinkedIn profile import flow: extracting the active
LinkedIn profile tab into a canonical draft and merging it into the user's
profile. The flow crosses two Chrome contexts (side panel → service worker) via
the typed bridge, and is gated by an **optional** LinkedIn host permission
requested in-context from the side panel.

For experiences, "complete import" means every position exposed by LinkedIn's
dedicated `/details/experience/` page, including positions hidden behind the
profile-page "Tout afficher" / "Show all" affordance. The result MUST NOT depend
on the source tab's scroll position or on the subset currently rendered in the
profile summary card.

The LLM never decides a transition. It may later enrich extracted content
inside a dedicated AI worker; the model decides when extraction/merge run and
how errors surface. **Le LLM produit des signaux ; le modèle décide.**

## Why a model

`chrome.tabs.query` only populates `tab.url` when the extension holds the
`tabs` permission, a matching host permission, or an active `activeTab` grant.
`activeTab` is revoked as soon as the user navigates inside the tab, so a
profile opened then interacted with no longer exposes its URL. LinkedIn is
declared in `optional_host_permissions` (privacy-first: not requested at
install), so the host permission must be requested from a UI context with a
user gesture before the service worker can read the tab URL, read LinkedIn
cookies, or inject the extraction script.

`chrome.permissions.request()` may only be called from a UI context (popup,
side panel, options page) during a user gesture — never from the service
worker. Requesting it from the SW (the old flow) always fails.

## Contexts

- **Side panel** (`src/ui/pages/CvPage.svelte`) — owns the user gesture (click
  on "Importer LinkedIn") and the permission request.
- **Service worker** (`src/background/index.ts`) — owns extraction
  (`LinkedInProfileExtractor`) and persistence (merge into `UserProfile`).
- **Bridge** (`src/lib/shell/messaging/bridge.ts`) — typed messages between the
  two; the side panel never touches `chrome.cookies`/`chrome.scripting`/IndexedDB
  directly.

## States (side panel, `handleLinkedInImport`)

```
idle ──CLICK─────────────────► checking-permission
checking-permission ──PERMISSION_GRANTED──► extracting
checking-permission ──PERMISSION_DENIED───► idle   (toast: "Autorisation LinkedIn refusée.")
extracting ──EXTRACT_OK(profile)──► merging
extracting ──EXTRACT_ERR(code,msg)──► idle   (toast: msg, typée par code)
merging ──MERGE_OK(addedCount, draftCount)──► idle   (toast: branch par compteur)
merging ──MERGE_ERR(msg)──► idle   (toast: msg)
```

### `MERGE_OK` branches (truthful, count-aware)

The merge outcome toast MUST reflect how many experiences were actually added,
not just that the merge ran. The SW computes `addedCount` via the pure
`countNewlyAddedExperiences(current, draft.experiences)` helper (same dedup key
as `mergeExperiences`), and `draftCount = draft.experiences.length`.

| Condition                            | Toast type | Message                                                        |
| ------------------------------------ | ---------- | -------------------------------------------------------------- |
| `draftCount === 0`                   | info       | "Aucune expérience renseignée sur votre profil LinkedIn."      |
| `addedCount === 0 && draftCount > 0` | info       | "Vos expériences LinkedIn sont déjà présentes dans votre CV."  |
| `addedCount > 0`                     | success    | "{addedCount} expérience(s) LinkedIn importée(s) avec succès." |

This fixes the "success toast but no data" regression: a recognized empty
LinkedIn profile or a fully-deduped merge no longer reports a misleading
success. An unreadable/partial experience page fails before merge.

`isImporting === true` for `checking-permission | extracting | merging` (button
disabled, reentrancy blocked).

## Events

- `CLICK` — user clicks "Importer LinkedIn".
- `PERMISSION_GRANTED | PERMISSION_DENIED` — result of
  `ensureLinkedInHostPermission()` (facade).
- `EXTRACT_OK(profile) | EXTRACT_ERR(code, message)` — result of
  `importLinkedInProfile()` (bridge `IMPORT_LINKEDIN_PROFILE`). The typed error
  union includes recoverable `detail_page_unavailable` in addition to the
  existing permission, session, profile, DOM, and challenge codes.
- `MERGE_OK(addedCount, draftCount) | MERGE_ERR(message)` — result of
  `syncLinkedInProfileImport(profile)` (bridge `SYNC_LINKEDIN_PROFILE_IMPORT`
  → `PROFILE_UPDATED`). `addedCount` is computed by the pure
  `countNewlyAddedExperiences` helper; `draftCount = profile.experiences.length`.

## Effects (shell)

- **Enter `checking-permission`**: `ensureLinkedInHostPermission()` runs in the
  side panel context:
  1. `chrome.permissions.contains({ origins: ['https://www.linkedin.com/*'] })`.
  2. If false, `chrome.permissions.request({ origins: ['https://www.linkedin.com/*'] })`
     (user gesture active). Returns `true`/`false`.
  - Documented UI exception (same category as clipboard write): permitted
    because it is the Chrome-recommended pattern for optional host permissions.
- **Enter `extracting`**: `importLinkedInProfile()` sends
  `IMPORT_LINKEDIN_PROFILE` → SW `LinkedInProfileExtractor.extractProfile(now)`.
- **Enter `merging`**: `syncLinkedInProfileImport(profile)` → SW
  `mergeCandidateProfileIntoUserProfile` → emits `PROFILE_UPDATED`.

## Extractor (service worker) — ordered checks

```
ensureExtractionPermission()          // contains-only; NO request from the SW
  └ missing ⇒ permission_required
resolveTab(active, currentWindow)
  └ !tab?.id || !tab.url ⇒ profile_not_found   ("Open a LinkedIn profile tab…")
classifyLinkedInUrl(tab.url)
  └ login ⇒ session_required | checkpoint ⇒ rate_limited_or_blocked | non-/in/ ⇒ profile_not_found
detectSession(cookies li_at)
  └ absent ⇒ session_required
capture source profile metadata (headline, summary, skills, education, links)
derive /in/{slug}/details/experience/ from the validated profile URL
run complete-experience submachine (inactive temporary tab; see below)
combine source metadata + complete experiences
  └ blockedReason ⇒ rate_limited_or_blocked | unreadable ⇒ dom_changed | else ⇒ canonical draft
```

The permission check runs **before** `resolveTab`: without the LinkedIn host
permission, `tab.url` is `undefined` and the URL classification would produce a
misleading `profile_not_found`. With the permission granted (by the side panel
gate), `tab.url` is readable for LinkedIn tabs.

URL classification is segment-exact. Session routes are `/login[/...]` and
`/uas/login[/...]`; verification routes are `/checkpoint[/...]` and
`/challenge[/...]`. These reserved names are classified only when they occupy
the corresponding leading route segment. They MUST NOT match substrings inside
a valid profile slug such as `/in/login/`, `/in/checkpoint-engineer/`, or
`/in/challenge-consulting/`. Source-page and detail-page classification consume
the same pure route classifier.

### Complete-experience submachine (service worker)

The profile summary card is not a complete source: LinkedIn may render only a
subset and place the rest behind "Tout afficher". The extractor therefore owns
a bounded submachine that reads the dedicated experience page without
navigating or mutating the user's active profile tab.

```text
resolving-detail-url
  ├─ INVALID_PROFILE_URL ───────────────────────────────► detail-error(profile_not_found)
  └─ DETAIL_URL_RESOLVED(url) ──────────────────────────► opening-detail-tab

opening-detail-tab
  ├─ TAB_OPEN_FAILED ───────────────────────────────────► detail-error(detail_page_unavailable)
  └─ TAB_OPENED(tabId, active=false) ───────────────────► waiting-detail-page

waiting-detail-page
  ├─ PAGE_READY ────────────────────────────────────────► extracting-detail
  ├─ LOGIN_REDIRECT ────────────────────────────────────► detail-error(session_required)
  ├─ CHALLENGE_REDIRECT | CHALLENGE_DOM ────────────────► detail-error(rate_limited_or_blocked)
  ├─ TAB_CLOSED | TIMEOUT ──────────────────────────────► detail-error(detail_page_unavailable)
  └─ SIDE_PANEL_CLOSED ─────────────────────────────────► waiting-detail-page

extracting-detail
  ├─ LIST_STABLE(items) ────────────────────────────────► closing-detail-tab
  ├─ DOM_UNREADABLE ────────────────────────────────────► detail-error(dom_changed)
  ├─ TIMEOUT ───────────────────────────────────────────► detail-error(detail_page_unavailable)
  └─ CHALLENGE_DOM ─────────────────────────────────────► detail-error(rate_limited_or_blocked)

detail-error(error) ────────────────────────────────────► closing-detail-tab(error)
closing-detail-tab(result) ── TAB_CLOSED_OR_ABSENT ─────► detail-terminal(result)
```

`SIDE_PANEL_CLOSED` does not cancel service-worker cleanup. Once a temporary tab
has been created, the service worker finishes the bounded operation and executes
the cleanup path. Closing the temporary tab manually is treated as a typed,
recoverable extraction failure; the source profile tab is never closed.

`detail_page_unavailable` is a recoverable shell error for tab creation/load,
manual close, or readiness timeout. `dom_changed` is reserved for a page that
loaded but whose experience structure or empty state cannot be recognized.

Recovery copy is determined by the typed terminal error, never by free text:

- `session_required`: ask the user to reconnect to LinkedIn, then relaunch the
  import;
- `rate_limited_or_blocked`: ask the user to complete LinkedIn's security
  verification/challenge, then relaunch the import;
- `detail_page_unavailable`: ask the user to reload LinkedIn, then relaunch the
  import.

#### Detail URL and tab lifecycle

- The detail URL is derived structurally from the already validated `/in/{slug}`
  URL, not from localized link text such as "Tout afficher".
- The service worker opens exactly one tab with `active: false`; it never
  navigates or focuses the source profile tab.
- The created `tabId` is recorded before waiting for page readiness.
- `chrome.tabs.remove(createdTabId)` runs from a `finally`-equivalent cleanup
  path on success, parse error, redirect, timeout, cancellation, or challenge.
- A close failure is recorded for diagnostics but MUST NOT replace a successful
  extraction result or the original extraction error. The shell emits a
  structured `detail_tab_cleanup_failed` warning containing only the temporary
  tab id and sanitized cause.

#### Readiness and completeness

- The shell constants are explicit: `DETAIL_PAGE_LOAD_TIMEOUT_MS = 15_000`,
  `DETAIL_LIST_STABILIZE_TIMEOUT_MS = 10_000`, and
  `DETAIL_LIST_OBSERVATION_MS = 500`.
- Extraction starts only after the detail document reports readiness and the
  final URL has been classified again.
- The injected function may wait asynchronously for the experience root.
- It scrolls the dedicated list to its end and observes the number of candidate
  position rows. The list is complete only after it has reached its end, exposes
  no active loading indicator, and keeps both row count and document height
  stable for two consecutive observation cycles.
- The wait is bounded by a hard timeout. Timeout produces
  `detail_page_unavailable`; it does not merge the partial rows accumulated
  before the timeout.
- A successfully recognized LinkedIn empty state may return zero experiences.
  The generic owner action `Add position` / `Ajouter un poste` is not an empty
  signal by itself: LinkedIn can render it while position rows are still being
  lazy-loaded. A canonical empty result requires all of these invariants:
  (1) the dedicated experience root is present, (2) a structural LinkedIn empty
  container (`.artdeco-empty-state` or an explicit empty-state test marker) is
  present, (3) zero position rows remain after scrolling/observation,
  (4) document height and row count are stable for the configured consecutive
  cycles, and (5) no active loader is visible. A zero-row page without that
  structural empty signal is `dom_changed` after the bounded observation;
  a page that exposed rows but never stabilized is a timeout. Neither case may
  be merged as an empty profile.

#### Single-flight ownership

- The service-worker shell owns one module-scoped complete-experience operation
  per canonical detail URL. Concurrent preview/import requests for the same
  profile join the same Promise and therefore create, extract from, and close
  exactly one temporary tab.
- The first caller is the leader. Its injected `now` value deterministically
  timestamps any shared `AppError`; followers receive the exact same `Result`
  value rather than rebuilding an error with their own clock.
- The in-flight entry is released only after the leader's terminal cleanup has
  completed (including a caught tab-close failure). A later explicit invocation
  starts a new operation with its own tab and its own `now` value.
- Different canonical detail URLs are independent. This mutualization does not
  create an implicit retry and does not broaden the single-tab invariant beyond
  one profile operation.

#### Experience DOM contract

The extractor uses structural and accessibility signals, in this order:

1. dedicated `/details/experience/` pathname + the page's main content;
2. stable `#experience` anchor or an Experience / Expérience heading fallback;
3. LinkedIn position-row containers, with a conservative list-item fallback;
4. visible/accessibility text nodes inside the resolved position row.

Line boundaries are captured **before** whitespace normalization. Newlines must
remain available to distinguish title, company/employment type, date range,
location, description, and skills. Hidden accessibility duplicates and action
labels are removed before field assignment.

Field assignment follows these deterministic signals:

- `title`: first primary/bold line in a leaf position row;
- `company` + `employmentType`: the company line split once on LinkedIn's middle
  dot separator; the optional right-hand value is preserved as display text;
- `dateRange`: first line containing a four-digit year and a range separator;
- `location`: first non-duration line immediately after the date line;
- `description`: remaining prose after structural/action/skill labels;
- `skills`: values from a whole-line `Compétences` / `Skills` label, either the
  label alone or the label followed by a colon and inline values. The label
  match is anchored to the complete line: prose such as "Skills developed
  while leading..." remains description text.

`employmentType` is an optional canonical experience field. Legacy/manual
experiences normalize it to `null`; import must not append the value to the
company name or silently discard it.

LinkedIn can group several roles under one company. A container with nested
position rows is a group, not a position: its company label is inherited by each
leaf row, and only leaf rows are emitted. In a grouped leaf, field assignment is
structural: after the title, the first date-range line fixes the date boundary;
only a non-date line between the title and that boundary may be the optional
`employmentType`. When the date immediately follows the title, the inherited
company is preserved and `employmentType` stays absent. A period, duration, or
location is never concatenated to the inherited company and never interpreted
as an employment type. Standalone rows are emitted directly.
Rows are de-duplicated using the same normalized `(title, company, start month)`
business key used by the canonical CV merge; DOM order only determines
`positionIndex`.

#### Retry policy

There is no automatic full retry: silently opening several LinkedIn pages can
increase rate-limit risk. After a terminal error, the user may explicitly click
"Importer LinkedIn" again. A new click starts a new submachine only after the
previous temporary tab has reached its cleanup terminal state.

### Blocked-reason detection (DOM)

`blockedReason` is computed inside `extractLinkedInProfileFromDom` (injected into
the page). It is the **fallback** for challenge interstitials LinkedIn serves on
a `/in/` URL without changing the URL — URL-path redirects to `/checkpoint/` or
`/challenge/` are already caught earlier by `classifyLinkedInUrl`.

Detection is **specific, corroborated, and not greedy**:

- Block signals are challenge-page-specific phrases only: "security
  verification", "unusual activity", "verify your identity", "temporarily
  restricted", "security check".
- The bare words "challenge" / "checkpoint" are NOT block signals: they appear
  in legitimate profile prose (e.g. "I enjoy new challenges", "project
  checkpoint") and previously caused false `rate_limited_or_blocked` errors that
  blocked real imports.
- A single free-text phrase is never sufficient on a profile URL. A DOM
  challenge requires corroboration from one of these deterministic structures:
  (1) a reserved `/checkpoint/` or `/challenge/` route; (2) an exact
  challenge-specific `main h1` plus a distinct challenge phrase outside that
  heading or a verification control; (3) at least two distinct
  challenge-specific phrases; or (4) a challenge phrase plus a verification
  control. Verification controls are structural form/input/test markers, not
  generic button text.
- Defensive guard: text/heading corroboration is authoritative only when the
  page has no strong profile marker (recognized About, Experience, or Education
  section, parsed experience/education, or a non-challenge `main h1`). These
  markers protect titles and biography prose from false positives. A stale
  secondary headline selector alone is not a strong marker because LinkedIn can
  leave it mounted behind an interstitial.
- Challenge detection is evaluated independently from headline selection. A
  corroborated challenge-specific `main h1` such as "Security verification" is
  prioritized over stale `.pv-text-details__left-panel` or
  `[data-generated-suggestion-target]` text, is returned with an empty headline,
  and terminates before the detail tab opens. Conversely, the exact headline
  "Security verification" without a second challenge signal, reserved route,
  verification control, or other corroboration remains legitimate profile data
  even when lazy profile sections have not rendered.

## Invariants

1. `chrome.permissions.request()` is called **only** from the side panel during
   a `CLICK` gesture, never from the service worker.
2. The extractor validates the LinkedIn host permission **before** reading
   `tab.url`.
3. If `tab.url` is `undefined` after the permission is granted, the active tab
   is not a LinkedIn tab → `profile_not_found` is correct.
4. `isImporting` blocks reentrancy for the whole `checking-permission →
extracting → merging` sequence.
5. Bridge errors are surfaced as typed toasts; the UI never crashes on
   null/unknown bridge responses (facade graceful handling).
6. The LLM never decides a transition. It may only enrich extracted content in
   a dedicated AI worker. **Le LLM produit des signaux ; le modèle décide.**
7. DOM block detection is specific: only challenge-page phrases are block
   signals, and only when no profile sections are present. The bare words
   "challenge" / "checkpoint" in body prose must NOT trigger a block — they
   appear in legitimate profile text.
8. The merge toast is count-aware: `MERGE_OK` carries `addedCount` +
   `draftCount`, and the UI branches on them. A merge that adds 0 experiences
   (empty extraction or full dedup) MUST NOT surface a success toast.
9. A CV import obtains experiences from the dedicated detail page, never from
   the incomplete profile summary card. Source-tab scroll position is irrelevant.
10. The active LinkedIn profile tab is never navigated, focused, or closed by
    extraction.
11. At most one inactive detail tab exists per import, and every terminal path
    reached after `TAB_OPENED` attempts to close that created tab exactly once.
12. Partial detail-page results are never merged. Only `LIST_STABLE(items)` or a
    recognized empty state can reach the canonical parser.
13. Text line boundaries are preserved until after field assignment; whitespace
    normalization cannot collapse a whole experience into its title.
14. Grouped company containers do not become duplicate experiences: only leaf
    positions are emitted, with inherited company context where required.
15. A zero-experience result is truthful only when LinkedIn's dedicated page
    exposes a recognized empty state. An absent/unreadable list is `dom_changed`.
16. Grouped leaves inherit company independently from their optional employment
    type; a date-range line can never populate or mutate either field.
17. A corroborated challenge-specific `main h1` is never accepted as a profile
    headline and cannot be suppressed by stale profile headline markup. The same
    text without corroboration remains a legitimate headline and cannot alone
    produce `blockedReason`.
18. Skills labels are whole-line contracts. Only `Skills` / `Compétences` or
    their colon-delimited inline values are structural; longer prose beginning
    with either word remains in the experience description.

## Error and recovery matrix

| Condition                                      | Code                      | User recovery                                                        |
| ---------------------------------------------- | ------------------------- | -------------------------------------------------------------------- |
| LinkedIn permission missing/refused            | `permission_required`     | Grant the optional LinkedIn permission and retry.                    |
| Login redirect or missing `li_at` session      | `session_required`        | Sign in to LinkedIn, then retry.                                     |
| Source tab is not a `/in/{slug}` profile       | `profile_not_found`       | Open the intended LinkedIn profile.                                  |
| Checkpoint/challenge URL or DOM                | `rate_limited_or_blocked` | Complete LinkedIn verification; do not auto-retry.                   |
| Detail tab cannot load or is manually closed   | `detail_page_unavailable` | Keep Chrome online and retry explicitly.                             |
| Detail list never stabilizes before timeout    | `detail_page_unavailable` | Reload LinkedIn and retry; no partial data is saved.                 |
| Experience root/rows no longer match contracts | `dom_changed`             | Update MissionPulse; do not instruct the user to scroll the profile. |
| Recognized detail-page empty state             | success with 0 rows       | Explain that LinkedIn contains no experience to import.              |

The UI MUST NOT use the current generic instruction "défilez jusqu'à la section
Expérience" for `dom_changed`: the complete importer owns navigation and lazy
loading, so scrolling is no longer a valid recovery action.

## Non-goals

- Do not add the `tabs` permission (too broad; install-time warning).
- Do not move LinkedIn to required `host_permissions` (breaks the
  minimal-permission, privacy-first posture; in-context request is the pattern).
- Do not request the LinkedIn origin from the service worker.
- Do not click localized "Tout afficher" text or navigate the source tab.
- Do not call undocumented LinkedIn APIs or depend on fetched application-shell
  HTML; extraction uses the authenticated, rendered detail page.
- Do not merge the visible summary-card subset as a fallback after a detail-page
  timeout or parse failure.
