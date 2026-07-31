---
target: apps/extension/src/sidepanel
total_score: 26
p0_count: 1
p1_count: 2
timestamp: 2026-07-28T10-26-20Z
slug: apps-extension-src-sidepanel
---

## MissionPulse — Side Panel Critique

**Target:** `apps/extension/src/sidepanel` (extension side panel — primary product UI)
**Register:** product (Bloomberg-terminal-for-freelancers; dense, calm, signal-over-noise)
**Method:** dual-agent (A: design review · B: detector + browser evidence)

---

### Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                                                                                                                                        |
| --------- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Visibility of System Status     | 3         | `ScanProgress` gives real-time connector status, but no global indicator during page transitions.                                                                                                                                                |
| 2         | Match System / Real World       | 3         | Direct French copy; "TJM"/"Stack" are jargon without inline definitions.                                                                                                                                                                         |
| 3         | User Control and Freedom        | 2         | No undo for "Hide mission"; hidden missions require Settings nav. No escape affordance for modal states.                                                                                                                                         |
| 4         | Consistency and Standards       | 2         | **Card radius drifts system-wide**: design tokens define 12px max, but `rounded-2xl` (16px) is applied to nearly every `section-card`, and `BackupRestoreModal` uses `rounded-3xl` (24px). Badge/Chip/Toggle express state three different ways. |
| 5         | Error Prevention                | 2         | Compare-limit disability isn't communicated _why_; no confirmation for destructive actions (hide, delete saved view).                                                                                                                            |
| 6         | Recognition Rather Than Recall  | 3         | Score breakdown hidden behind a toggle with no affordance on the badge itself; stack filter requires recalling tech names.                                                                                                                       |
| 7         | Flexibility and Efficiency      | 3         | Lazy-loaded feed is efficient, but no visible keyboard-shortcut hints despite "keyboard-first" being a stated feature; no bulk actions.                                                                                                          |
| 8         | Aesthetic and Minimalist Design | 4         | Strongest dimension. Restrained palette, semantic color, containment over heavy shadows.                                                                                                                                                         |
| 9         | Error Recovery                  | 2         | `OperationalEmptyState` is passive — "Réessayer" with no diagnosis of _why_ a connector broke or link to fix it.                                                                                                                                 |
| 10        | Help and Documentation          | 1         | No visible help, contextual `?`, or first-run scaffolding beyond the empty-state CTA. Tour prop exists but isn't surfaced.                                                                                                                       |
| **Total** |                                 | **26/40** | **Functional, needs polish**                                                                                                                                                                                                                     |

Previous snapshot for this slug: 25/40. Movement: +1, driven by stronger status visibility and refined empty states; dragged by consistency drift and absent help.

---

### Anti-Patterns Verdict

**Does this look AI-made?** No — this is one of the cleaner product surfaces in the repo. The register discipline holds.

**LLM assessment (avoided):** No gradient text, no glassmorphism-as-default, no side-stripe borders, no ghost-card (1px border + wide shadow) pairing, no 32px+ card radii, no decorative grid backgrounds, no sketchy SVGs, no numbered section scaffolding, no hero-metric template. Display font (FH Total Display) is correctly confined to hero headlines and absent from UI labels/buttons/data — a product-register ban that is respected. Motion is purposeful (staggered card entry capped at 300ms, IntersectionObserver-driven reveal), not decorative.

**LLM assessment (present tells — minor):**

1. **Eyebrow-on-every-section reflex.** Uppercase tracked micro-labels ("DÉCISION", "VUES", "SOURCE", "NOUVEAU", "STACK") appear across `OperationalEmptyState`, `FilterBar`, and `MissionCard`. One or two would read as voice; the density reads as grammar.
2. **Operational template rigidity.** `OperationalEmptyState` runs the same icon+badge+title+description+proof+action skeleton across 6+ severities. It's well-built but templated — the connective tissue between states is formulaic.
3. **Nested evidence cards.** `MissionComparison`'s 2×2 "Decision Evidence" grid duplicates the recommendation prose. Card-in-section-in-modal is the AI "decision support" reflex.

**Deterministic scan:** CLI detector returned **1 finding** — `single-font` on `apps/extension/src/sidepanel/index.html:13` (only "geist" seen). This is a **false positive**: the project uses a documented two-font system (FH Total Display + Geist) declared in the CSS-first `@theme` (`packages/design/theme.css`), which the markup-only detector cannot resolve. The **browser runtime overlay found 0 anti-patterns** in the rendered page, exonerating the markup-only hit. No user-visible overlay was left in place (injection was preflight-only; the live `detect.js` run reported clean and the server was stopped).

**Net:** no exploitable design anti-patterns in the rendered UI. The one CLI hit is noise from incomplete source scanning.

---

### Overall Impression

The side panel largely delivers on the "calm terminal for freelancers" promise: dense, legible, restrained. MissionCard earns its density — score, stack, TJM, and remote are visible without expanding, which is the product's central bet. The single biggest opportunity is **state ambiguity at the make-or-break moments**: the empty state conflates "never scanned" with "scanned and found nothing", and the operational story card rewrites itself across 7 states without a persistent anchor. A first-time user who completes onboarding, runs a scan, and sees "0 missions" will assume the tool is broken.

---

### What's Working

1. **Scoring transparency via progressive disclosure.** MissionCard shows a compact grade badge by default and hides the full breakdown behind a toggle — respects "decision in one pass" while preserving auditability. The `grade` + semantic `+` suffix is a tight signal.
2. **Operational empty states with a "proof" box.** `OperationalEmptyState` includes a "Résultat affiché" evidence line ("0 mission", "X missions") that grounds status in observable reality — earned operational voice, show-don't-tell. Severity-based tinting is semantic, not decorative.
3. **Lazy-loaded feed with explicit escape hatch.** `VirtualMissionFeed` auto-loads via IntersectionObserver (200px rootMargin) _and_ offers a manual "Voir X de plus" button — serves both power users and cautious users without forcing either pattern.

---

### Priority Issues

#### [P0] First-scan empty state does not distinguish "never ran" from "ran and found nothing"

- **Why it matters:** A user who configures sources, runs their first scan, and gets a legitimate zero will see the _same_ "Lancez un premier scan" message as a user who never scanned. They will conclude configuration failed and abandon. This is the uninstall moment.
- **Evidence:** `FeedPage.svelte` `buildFeedStory` returns `severity:'neutral', title:'Lancez un premier scan'` whenever `visibleCount === 0`, with no check for prior scan completion. `VirtualMissionFeed` renders this verbatim.
- **Fix:** Feed `buildFeedStory` a `{ hasCompletedScan, lastScanAt }` context. When a scan completed but yielded 0, switch to `severity:'attention', title:'Aucune mission ne correspond à votre profil actuel'`, explain the scan _did_ run, and route to profile/source expansion — not back to "launch scan".
- **Suggested command:** `$impeccable clarify`

#### [P1] Comparison modal dumps 12+ data points flat — adds load instead of reducing it

- **Why it matters:** Comparison is invoked _because_ the user is overwhelmed by 2-3 similar missions. The modal responds with a 9-row table + recommendation box + 2×2 evidence grid. Users scan row-by-row instead of trusting the verdict.
- **Evidence:** `MissionComparison.svelte` renders every field (TJM, Location, Remote, Duration, Start, Seniority, Score, Source, Client) in one flat table; the "Decision Evidence" cards duplicate the recommendation prose.
- **Fix:** Collapse to Title/Stack/Score/TJM/Action by default; full table behind "Voir tous les détails". Remove the evidence grid (the recommendation text already carries it). Add a `border-blueprint-blue/40` column highlight on the recommended mission so the table reinforces the verdict.
- **Suggested command:** `$impeccable distill`

#### [P1] FilterBar tech chips render an unbounded list (10+ visible options)

- **Why it matters:** A realistic feed surfaces 15-20 stacks (React, Vue, Node, Python, AWS, Docker, …). `FilterBar` renders them all as a wrapping chip cloud — violates the ≤4-visible-options rule and forces tag-cloud scanning instead of a focused decision.
- **Evidence:** `FilterBar.svelte` `{#each availableStacks as stack}` with no limit, count-sort, or grouping.
- **Fix:** Show top-N by mission count (pass `stackCounts`), hide the rest behind "Voir X autres technologies". If a tech taxonomy exists (Languages/Frameworks/Infra/Tools), group into 4 collapsible sections instead of one flat list.
- **Suggested command:** `$impeccable layout`

#### [P2] Card radius drifts system-wide off the committed token scale

- **Why it matters:** DESIGN.md commits a 6/8/12px radius scale, but `rounded-2xl` (16px) is applied to almost every `section-card` across FeedPage, SettingsPage, TJMPage, ProfilePage, ApplicationsPage, and `VirtualMissionFeed`; `BackupRestoreModal` uses `rounded-3xl` (24px). This is both a consistency failure (Nielsen #4) and the codex over-rounding tell at the upper end. Identity drift, not a cosmetic nit.
- **Evidence:** `grep -rn "rounded-2xl\|rounded-3xl" apps/extension/src/ui` — 20+ hits, almost all on `section-card-strong` surfaces.
- **Fix:** Pick one card radius from the committed scale (likely `rounded-xl`/12px) and sweep the codebase. Reserve `rounded-full` for chips/tags/buttons only. Drop the modal to 12-16px max.
- **Suggested command:** `$impeccable polish`

#### [P2] Score badge has no affordance — the breakdown toggle is invisible

- **Why it matters:** The score badge is the primary decision signal and the product principle is "trust via transparency — show _why_". But the badge renders as a static `<span>` while a sibling element owns the toggle. Users won't discover the breakdown exists.
- **Evidence:** `MissionCard.svelte:307` renders `{mission.scoreBreakdown.grade}` as a span; `handleScoreDetailsToggle` is bound to a separate region (line 369), not the badge.
- **Fix:** Make the badge itself a `<button aria-label="Voir le détail du score">` with `cursor-pointer` and a subtle hover underline or tiny `ⓘ` when `hasScoreDetails`. Principle #4 demands the affordance be visible by default.
- **Suggested command:** `$impeccable clarify`

---

### Persona Red Flags

**Power User (scans 2×/day, qualifies 50+ missions/week, keyboard-first)**

- _Open → scan feed → qualify top 3 → mark rest seen → close, target <60s._
- **Fails at:** `VirtualMissionFeed` batch size (default ~20). With 80 missions, the power user must scroll-trigger the sentinel or click "Voir 20 de plus" three times. No "load all", no keyboard shortcut to expand. Stated "keyboard-first" feature is invisible — no shortcut hints anywhere. Adds ~6s and 3 clicks to a time-critical workflow; they will revert to raw platform tabs.

**First-Timer (just installed, unfamiliar with the domain)**

- _Onboard → configure profile → first scan → trust the scores, target <5min._
- **Fails at:** The "Lancez un premier scan" CTA gives no model of what a scan _is_ — which sources, whether creds are needed, how long, what they'll see after. They click, see a spinner, and have no frame for success/failure. Combined with the P0 empty-state ambiguity, the first scan is the uninstall cliff.

**Side-panel Context-Switcher (intermittent 10-30s bursts between other tabs)**

- _Scan feed 30s → favorite 2 → leave → return 5min later → open favorites._
- **Fails at:** Expanded-mission state is component-local, not persisted. They expand a card, switch tabs, come back, and the card is collapsed again — they must re-find and re-expand. Expanded IDs should live in a persisted rune store.

---

### Minor Observations

- **Eyebrow micro-labels** ("NOUVEAU", "VU", "SOURCE") are applied reflexively across MissionCard and FilterBar — the uppercase-tracked kicker pattern creeping into chip-scale UI. Voice at one or two points; grammar at this density.
- **Saved-view name mismatch:** `FilterBar` caps input at 48 chars but truncates display at `max-w-28` (~12-14 chars). Users save "High-priority React missions in Paris" and see "High-priority…". Cap the input to match the visual budget.
- **No loading skeleton for the comparison modal** — it renders blank before populating when invoked with 3 IDs.
- **`ScanProgress` exposes two near-identical counts** (`missionsFound` vs `partialMissionCount`) in different regions of the same surface.
- **Backdrop-blur** appears once on the arrival-stack pill (`FeedPage:1825` `backdrop-blur-sm`) — fine, but it is the thin end of glassmorphism; keep it isolated to floating overlays.

---

### Questions to Consider

1. **What if the operational story were a timeline, not a single rewriting card?** It currently erases its own history on each state change. A vertical log ("2min: scan done, 23 missions · 5min: LeHibou failed · 10min: scan started") would cut re-orientation cost when users return after hours.
2. **Should the score badge show relative rank, not absolute grade?** A 75/B in a weak batch might still be the best available. `#1 / 23` shifts the mental model from "is this good?" to "is this better?".
3. **Why does the comparison modal exist as a modal at all?** The recommendation is computable the moment the user clicks "Compare". A toast ("Mission X has the highest score — open it?") plus inline badges may serve the job without the modal transition.

---

### Run Notes (deterministic provenance)

- **Target slug:** `apps-extension-src-sidepanel`
- **Ignore list:** none (`.impeccable/critique/ignore.md` absent)
- **Assessment independence:** A and B ran as two isolated parallel sub-agents; A finished before B's detector evidence entered synthesis.
- **CLI detector:** exit 2, 1 finding (`single-font`), judged false positive (CSS-first `@theme` two-font system not visible to markup-only scan).
- **Browser visibility:** new tab opened at http://localhost:5176/src/sidepanel/index.html, resized to 420×720; baseline empty-state captured.
- **Overlay injection:** preflight mutation succeeded (title set, script appended); live `detect.js` injected via `live-server.mjs` on port 8400; console reported `impeccable:detector-loaded` then "No anti-patterns found" (0 findings).
- **Live server cleanup:** stopped (PID killed) before reporting.
- **Dev server:** `@pulse/extension` dev server running on :5176 (detached); keep-alive not required for the report.
