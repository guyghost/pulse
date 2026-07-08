---
target: The Feed (FeedPage + MissionCard + FilterBar)
total_score: 28
p0_count: 1
p1_count: 2
timestamp: 2026-07-07T21-26-25Z
slug: apps-extension-src-ui-pages-feedpage-svelte
---

# Impeccable Critique — MissionPulse Feed

**Target:** The Feed — `FeedPage` + `MissionCard` + `FilterBar` + feed layout (`apps/extension/src/ui/pages/FeedPage.svelte` and ecosystem)
**Slug:** `apps-extension-src-ui-pages-feedpage-svelte`
**Method:** dual-agent (A: `critique-a2-design-review` · B: `critique-b-detector-evidence`)

---

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                      |
| --------- | ------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 3         | OperationalStoryCard + ScanProgress show state; some skeletons miss `aria-busy`                |
| 2         | Match System / Real World       | 3         | French UI on-brief; "TJM"/"stack" jargon justified for audience, no glossary                   |
| 3         | User Control and Freedom        | 3         | **No undo for Hide/Favorite**; comparison capped at 3 with no pre-warning                      |
| 4         | Consistency and Standards       | 3         | Badge vocabulary consistent; "Vues" saved-view pattern diverges from chip toggles              |
| 5         | Error Prevention                | 2         | No confirm on "Masquer"; compare limit invisible until 3rd pick; save-view form has no preview |
| 6         | Recognition Rather Than Recall  | 3         | Filters collapse (must expand to recall active state); `/` kbd hint is good but scoped         |
| 7         | Flexibility and Efficiency      | 3         | Shortcuts + saved views exist; **no bulk actions** for high-volume feeds; `j/k` nav absent     |
| 8         | Aesthetic and Minimalist Design | 3         | MissionCard is dense — collapsed state repeats score color + insight block                     |
| 9         | Error Recovery                  | 3         | OperationalEmptyState handles empty/error/offline; no recovery path when compare fails         |
| 10        | Help and Documentation          | 2         | Tour exists but no persistent help; semantic vs deterministic score not explained inline       |
| **Total** |                                 | **28/40** | **Good (border of Acceptable)**                                                                |

---

## Anti-Patterns Verdict

**Does this look AI-generated? No.** This is the rare surface that clears the slop bar.

**LLM assessment:** Zero absolute bans. No gradient text, no glassmorphism-as-default (backdrop-blur is correctly limited to modals/overlays), no side-stripe borders, no hero-metric template, no `01/02/03` scaffolding, no sketchy SVG, no decorative grid backgrounds, no `border:1px solid X` + wide-shadow combo, no card radius over 20px. The 113 instances of uppercase tracked labels (`tracking-[0.13–0.15em]`) are **semantic section eyebrows** ("VUES", "SOURCE", "ACTION RECOMMANDÉE"), not the reflex "ABOUT / PROCESS / PRICING" kicker applied to every section — voice, not grammar. Icons are Lucide. Decision-insight blocks use tone-coded full borders + tinted bg, not side accents. This reads as a deliberate design system, not a template.

**Deterministic scan (the important nuance):**

- **Source markup — CLEAN.** `detect.mjs --json` over all 12 Feed files **and** the entire `apps/extension/src/ui` tree: **exit 0, zero findings.** The code itself contains none of the detectable anti-patterns.
- **Rendered DOM — 104 findings.** The in-page detector (injected against the live dev server) found the issues the static analyzer can't see:
  - **nested-cards ×71** — MissionCards render inner sub-blocks (decision-insight blocks, action clusters) that each carry surface + border treatment, and the feed sits inside a `section-card` wrapper → redundant card-within-card depth.
  - **line-length ×26** — mission descriptions run past ~80ch on the wide side-panel viewport.
  - **low-contrast ×2** — blueprint blue `#0b64e9` on subtle gray `#ececea` = **4.4:1** (AA needs 4.5:1).
  - **tiny-text ×3**, **layout-transition ×2** (margin/padding transitions → jank), **overused-font ×1** (Geist at 81%), **cramped-padding ×1**.

**Visual overlays:** In-page detector overlays were rendered successfully in the live browser tab against `http://localhost:5176/src/sidepanel/index.html`; console reported the 104 counts above. Live server was stopped cleanly after evidence capture.

**Verdict:** The design _system_ is sound and intentional. The failures are in _execution density_ — too many nested surfaces, too many actions, and two contrast misses — not in taste or template-reflex.

---

## Overall Impression

MissionPulse's Feed genuinely delivers on its two hardest principles: **decision-in-one-pass** (score / stack / TJM / remote are all visible on the collapsed card) and **trust-through-transparency** (the "Pourquoi ce score ?" breakdown with criteria grades + semantic reason is exceptional — the kind of feature that builds the "Bloomberg terminal for freelances" confidence the brief asks for). Where it stumbles is _restraint_: each card tries to do too much (7 actions, nested sub-cards, redundant insight blocks), and two WCAG AA contrast failures undercut a product whose own PRODUCT.md markets accessibility as a feature. The single biggest opportunity: **reduce per-card surface area** so the density reads as "calm terminal," not "cluttered marketplace" — which is the exact anti-reference the brief names.

---

## What's Working

1. **Score transparency is best-in-class.** "Pourquoi ce score ?" exposes the deterministic base, per-criteria grades (Stack/TJM/Location/Remote with A–D badges + color circles), the semantic boost, and a clear line separating "calculé depuis le profil et l'annonce" from "L'analyse locale ajoute une hypothèse courte et reste facultative." This is precisely the "trust through transparency" principle, operationalized.
2. **Decision-insight blocks prime triage without a click.** Tone-coded borders + one-line action copy ("À examiner en premier : score fort et TJM 650€/j") let a user prioritize without expanding — directly serving "decision in one pass."
3. **Empty/error/offline states are operational, not decorative.** `OperationalEmptyState` pairs a severity badge + evidence + an explicit next action ("Lancer le scan", "Réessayer"), treating an empty feed as a decision point rather than a dead end. The OperationalStoryCard KPIs (Nouvelles / Prioritaires 80+ / Sources en erreur) are action-driving signals, not vanity metrics.

---

## Priority Issues

### [P0] WCAG AA contrast failures — two distinct

- **What:** (a) FilterBar section labels use `text-[11px] uppercase tracking-[0.15em] text-text-muted` → `#6b6561` on `#f5f5f4` canvas = **4.3:1** (fails AA body 4.5:1). (b) Blueprint blue `#0b64e9` on subtle gray `#ececea` = **4.4:1** (detector-confirmed). Both appear on primary triage chrome.
- **Why it matters:** PRODUCT.md targets WCAG 2.1 AA _and_ markets keyboard-first/accessibility as a feature. The Sam persona (screen-reader/low-vision) hits these on every scan. A product whose brand is "trust through clarity" can't ship sub-AA contrast on its filter rail.
- **Fix:** Swap `text-text-muted` → `text-text-subtle` (`#57534d`, ~7:1) for FilterBar labels (`FilterBar.svelte` L95, L174, L187, L200, L214) and any label under 12px/regular. For the blue-on-gray hit, darken the blue to a token that clears 4.5:1 on `subtle-gray` (e.g. `oklch(0.45 0.18 250)`) or move the blue element onto white. Verify both with a contrast check in the build.
- **Suggested command:** `$impeccable audit` (a11y/contrast is audit's domain), then `$impeccable polish`.

### [P1] MissionCard action overload — 7 buttons on the collapsed card

- **What:** Collapsed state surfaces favorite / hide / compare / copy / open + "Investiguer →" link + tracking-transition buttons (Préparée/Candidaté/Archivé) when present = up to 7 simultaneous affordances.
- **Why it matters:** Blows past the ≤4 working-memory limit at the _unit of triage_. The whole product thesis is "qualify each mission in one pass"; forcing the user to parse 5–7 options per card converts calm scanning into clutter — the exact Malt/Free-Work anti-reference.
- **Fix:** Move "Investiguer →" and tracking transitions into the **expanded** state only. Collapse copy/open into a hover-revealed overflow (⋯) menu. Target ≤4 visible actions collapsed (favorite, expand, + 1 contextual). `MissionCard.svelte` L480–589.
- **Suggested command:** `$impeccable distill` (strip to essence), then `$impeccable layout`.

### [P1] Nested-card depth — 71 detector hits

- **What:** MissionCard renders inner blocks (decision-insight, action cluster, detail grid) that each carry their own surface tint + border, and the feed itself sits inside a `section-card` wrapper → card-within-card-within-card.
- **Why it matters:** Redundant depth creates visual hierarchy confusion — the eye can't tell what's a container vs. what's content. Density without structure is noise, the opposite of "dense but legible."
- **Fix:** Flatten the inner blocks: drop borders/bg on decision-insight (keep the tone-coded left-edge or icon only), let the detail grid inherit the card surface, and remove the outer `section-card` wrap around the feed so MissionCards are the single card layer. Reserve full card treatment for one level only.
- **Suggested command:** `$impeccable distill` (carried with the action-overload pass), then `$impeccable layout`.

### [P2] No undo for destructive Hide / Favorite

- **What:** `onHide` and `onToggleFavorite` persist immediately — no confirmation, no undo toast. Recovery is a "Voir les X missions masquées" link buried at the feed bottom.
- **Why it matters:** A stray click on a high-score mission is unrecoverable except by scrolling to the footer. The codebase already has `createUndoController` (`feed-page.svelte.ts` L45) — the affordance exists but isn't wired to the most consequential actions. User-control/freedom heuristic takes the hit.
- **Fix:** Show a 5s "Mission masquée • Annuler" toast on hide/favorite, wired to the existing undo controller. Files: `MissionCard.svelte` L175–183, `feed-page.svelte.ts`.
- **Suggested command:** `$impeccable harden`.

### [P2] Mission descriptions run past ~80ch (26 detector hits)

- **What:** Mission description prose wraps wide on the side-panel viewport, exceeding the 65–75ch comfortable line length.
- **Why it matters:** Long lines hurt the "legible density" principle — the terminal metaphor relies on scannable type, not wall-of-text. Compounds the cognitive-load on Riley (long titles) and the general scan task.
- **Fix:** Cap description containers with `max-width: 70ch` (or `max-w-prose`) on the description block in `MissionCard.svelte`, and confirm the virtual feed column isn't over-wide at the side-panel breakpoint.
- **Suggested command:** `$impeccable typeset`.

### [P3] Emotional-valley copy at the three worst moments

- **What:** (a) All-connectors-broken `ConnectorAlertBar` reports "Impact opérationnel" with no forward path. (b) Zero-match filter result reads "Filtre trop strict" — blames the user. (c) `ProfileRefinementBanner` after a 90%-complete onboarding anchors on the 10% gap ("À compléter : Mots-clés") with a yellow attention tone on the first-scan peak.
- **Why it matters:** These are the product's three emotional valleys. The brief demands "calm confidence" and "no urgency theater"; instead the copy punishes/deflates at exactly the moments reassurance is cheapest to deliver.
- **Fix:** (a) Add "Vous pouvez encore qualifier les missions en cache" + a "Voir les N missions en cache" CTA to `ConnectorAlertBar`. (b) Reframe to "Aucune mission ne correspond — essayez d'élargir un filtre." (c) Flip the banner to success tone ≥80% profile: "Profil opérationnel à 90% — vos résultats sont déjà pertinents." Files: `ConnectorAlertBar.svelte`, `OperationalEmptyState.svelte`, `ProfileRefinementBanner.svelte`.
- **Suggested command:** `$impeccable clarify`.

---

## Persona Red Flags

_Primary action: open side panel → scan feed → qualify one mission._

- **Alex (impatient power user):** No `j/k` feed navigation, no `x` to hide, no `f` to favorite, no bulk "mark visible as seen" — triaging 1000 missions is one-at-a-time. Comparison (max 3) has no keyboard path. Saved-view cap of 6 is unexplained. `/` search hint and skippable tour are good. 60s triage is feasible _only_ if the user already trusts the score.
- **Sam (accessibility-dependent):** Focus indicator is genuinely good (`outline-offset: 3px` + ring). MissionCard is keyboard-expandable (Enter/Space). Color is not sole meaning-carrier (score has letter grades, NOUVEAU has text). **But:** the FilterBar-label contrast miss (4.3:1) and blue-on-gray (4.4:1) fail AA on primary chrome; no skip-link to jump the rail; `FeedTourOverlay` obscures the very controls it points at.
- **Riley (stress tester):** Virtual scrolling handles 1000 missions; `line-clamp-2` contains long titles; offline `OperationalStoryCard` reassures with "données en cache" **but no cache-age timestamp** — staleness is invisible. Empty feed is neutral but gives no onboarding nudge. All-connectors-broken demands per-connector re-check (no "check all"). Cancel-scan isn't visible in every ScanProgress context.

---

## Minor Observations

- **"Investiguer →" competes with the card-level expand** — two mechanisms open the same detail. Pick one (recommend the card click; demote the text link).
- **Decision-insight is redundant with score color** for ≥80 (green badge already signals "priority") — show the insight block only for the ambiguous 60–79 band.
- **Layout transitions on margin/padding (2 hits)** — animate `transform`/`opacity` instead to avoid reflow jank.
- **Tiny-text (3 hits) + cramped-padding (1)** — bump sub-12px body to 12px and add ≥4px vertical padding on 14px text for tap targets.
- **Overused-font (Geist 81%)** — acceptable for a product register (one well-tuned sans is the guidance), but a second weight or the display face for hero numbers would add hierarchy.
- **Pull-to-refresh on a desktop side panel** (`FeedLayout` L26) — verify it's gated to touch input so mouse drag-scroll doesn't accidentally trigger a rescan.
- **`SearchInput` `/` hint is a micro-UX win** — extend the pattern (e.g. `⌘R` near the scan button on hover).

---

## Questions to Consider

1. The Feed currently mixes **triage** (new missions) and **project management** (tracked-mission transitions) in one stream. Would splitting tracked missions into the existing "Suivi" tab — keeping the Feed pure "qualify or dismiss" — cut the per-card action count and the cognitive mode-switching?
2. Should "Pourquoi ce score ?" **auto-expand on the first mission** of a session to establish trust, then collapse for speed? (Onboarding trust vs. ongoing density.)
3. The 6-saved-view limit — is it a UX choice or an IndexedDB constraint? If UX, why 6?

---

## Run Notes

- **Target slug:** `apps-extension-src-ui-pages-feedpage-svelte` (computed, non-null → persistence enabled).
- **Ignore list:** none (`.impeccable/critique/ignore.md` absent).
- **Assessment independence:** dual-agent — A and B ran as two isolated parallel sub-agents; B's detector output did not enter A's context (A was explicitly instructed not to run `detect.mjs`). No degradation.
- **CLI detector:** ran clean over 12 Feed files + whole `apps/extension/src/ui` tree; exit 0, zero findings.
- **Browser visibility:** live dev server confirmed at `http://localhost:5176/src/sidepanel/index.html` (200 OK); fresh tab used.
- **Overlay injection:** mutable injection succeeded; in-page `detect.js` overlay rendered, console reported 104 findings (counts above).
- **Live-server cleanup:** Assessment B stopped its live server (PID terminated) after capture.
- **Assessment A re-run:** first A run returned truncated (tail only); re-ran with a terse output budget and received the full report intact. No data fabricated.
