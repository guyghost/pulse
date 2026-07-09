# LinkedIn Import Model

Source of truth for the LinkedIn profile import flow: extracting the active
LinkedIn profile tab into a canonical draft and merging it into the user's
profile. The flow crosses two Chrome contexts (side panel → service worker) via
the typed bridge, and is gated by an **optional** LinkedIn host permission
requested in-context from the side panel.

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

| Condition                            | Toast type | Message                                                                                                                                    |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `draftCount === 0`                   | info       | "Aucune expérience trouvée sur votre profil LinkedIn. Ouvrez votre profil, défilez jusqu'à la section Expérience, puis relancez l'import." |
| `addedCount === 0 && draftCount > 0` | info       | "Vos expériences LinkedIn sont déjà présentes dans votre CV."                                                                              |
| `addedCount > 0`                     | success    | "{addedCount} expérience(s) LinkedIn importée(s) avec succès."                                                                             |

This fixes the "success toast but no data" regression: a partial extraction
(headline/skills found, 0 experiences) or a fully-deduped merge no longer
reports a misleading success.

`isImporting === true` for `checking-permission | extracting | merging` (button
disabled, reentrancy blocked).

## Events

- `CLICK` — user clicks "Importer LinkedIn".
- `PERMISSION_GRANTED | PERMISSION_DENIED` — result of
  `ensureLinkedInHostPermission()` (facade).
- `EXTRACT_OK(profile) | EXTRACT_ERR(code, message)` — result of
  `importLinkedInProfile()` (bridge `IMPORT_LINKEDIN_PROFILE`).
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
scripting.executeScript(extractLinkedInProfileFromDom)
  └ blockedReason ⇒ rate_limited_or_blocked | empty ⇒ dom_changed | else ⇒ canonical draft
```

The permission check runs **before** `resolveTab`: without the LinkedIn host
permission, `tab.url` is `undefined` and the URL classification would produce a
misleading `profile_not_found`. With the permission granted (by the side panel
gate), `tab.url` is readable for LinkedIn tabs.

### Blocked-reason detection (DOM)

`blockedReason` is computed inside `extractLinkedInProfileFromDom` (injected into
the page). It is the **fallback** for challenge interstitials LinkedIn serves on
a `/in/` URL without changing the URL — URL-path redirects to `/checkpoint/` or
`/challenge/` are already caught earlier by `classifyLinkedInUrl`.

Detection is **specific, not greedy**:

- Block signals are challenge-page-specific phrases only: "security
  verification", "unusual activity", "verify your identity", "temporarily
  restricted", "security check".
- The bare words "challenge" / "checkpoint" are NOT block signals: they appear
  in legitimate profile prose (e.g. "I enjoy new challenges", "project
  checkpoint") and previously caused false `rate_limited_or_blocked` errors that
  blocked real imports.
- Defensive guard: text signals are authoritative only when the page has no
  parseable profile sections (no headline, no experiences, no education). A page
  that yielded real profile sections is never treated as blocked on text alone.

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

## Non-goals

- Do not add the `tabs` permission (too broad; install-time warning).
- Do not move LinkedIn to required `host_permissions` (breaks the
  minimal-permission, privacy-first posture; in-context request is the pattern).
- Do not request the LinkedIn origin from the service worker.
