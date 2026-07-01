---
target: apps/extension
total_score: 24
p0_count: 2
p1_count: 2
timestamp: 2026-07-01T12-41-10Z
slug: apps-extension
---

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                               |
| --------- | ------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 3         | LastScanInfo + connector indicators are good; no loading skeleton on first populate; scan errors lack retry affordance                  |
| 2         | Match System / Real World       | 4         | TJM, remote/freelance, platform names, "mission" terminology all match FR freelance conventions exactly                                 |
| 3         | User Control and Freedom        | 2         | No undo on Hide; no recovery for hidden missions; filters persist with no "clear all"; pills missing Escape                             |
| 4         | Consistency and Standards       | 3         | Platform color-coding consistent; score visualisation inconsistent (color-only, no label); TJM styled differently in header vs metadata |
| 5         | Error Prevention                | 2         | No search debounce; no confirm-before-hide; 15 filter pills enable decision errors; premium-locked filters silently toggle              |
| 6         | Recognition Rather Than Recall  | 3         | Filters persist; but score scale undocumented, collapsed-filter state invisible, meaning must be memorised                              |
| 7         | Flexibility and Efficiency      | 2         | No card-action keyboard shortcuts; no multi-select; no filter presets; no jump-to-top in virtual feed                                   |
| 8         | Aesthetic and Minimalist Design | 3         | Cards are purposeful, not decorative; but FilterBar shows 15 options flat (no grouping), steady-state status line is noisy              |
| 9         | Error Recovery                  | 1         | Scan errors shown but not actionable; hidden missions unrecoverable; failed-platform detail buried                                      |
| 10        | Help and Documentation          | 1         | No first-run guidance; score meaning undocumented; premium lock unexplained; FilterBar ungrouped with no tooltips                       |
| **Total** |                                 | **24/40** | **Adequate** (20-25 band)                                                                                                               |

## Anti-Patterns Verdict

**LLM assessment**: Not obviously AI-generated. No gradient text, no glassmorphism, no side-stripe borders, no numbered 01/02/03 markers, no hero-metric template, no decorative motion. Card hierarchy is real (title / description / metadata+actions), not the identical-icon-card grid slop. The typography scale is deliberate. The single AI tell that DOES remain: muted-gray body text (#a6a09b) used pervasively for secondary copy — the classic "calm but illegible" AI move.

**Deterministic scan**: CLEAN. The bundled detector reported exit code 0, zero findings across the extension source. No contrast, slop-family, or anti-pattern rule fired automatically — but note the detector cannot catch the token-level contrast problem because text-muted is applied via Tailwind classes against a token, not as a hardcoded pair the regex engine resolves.

**Browser visualization**: Skipped. The extension is a Chrome MV3 sidepanel, not servable as a plain page in a headless browser. No user-visible overlay is available; CLI scan is the fallback evidence.

## Overall Impression

A genuinely well-disciplined terminal-style feed that resists nearly every AI-design cliché — and then undermines itself with one systemic accessibility failure (muted text at 2.37:1 contrast, used 40 files deep) and a FilterBar that mistakes "comprehensive" for "usable." The bones are Bloomberg-terminal-grade; the contrast and the filter IA are what's keeping it from being genuinely trustworthy.

## What's Working

1. **Semantic platform color-coding** — Malt=pink, Free-Work=orange etc., consistent across badges and indicators. Power users can triage by color scan without reading text. Exactly the "dense but legible" register the brand calls for.
2. **Metadata compression in MissionCard** — stack tags, TJM, duration, location, posted-date in one flex-wrap row with icons. Achieves the "decisions in one pass" principle for the primary task.
3. **Persistent filter state across sessions** — set "Remote + React + 400+" once, return daily. Lowers routine cognitive load, fits "calm confidence."

## Priority Issues

### [P0] text-muted contrast failure (accessibility blocker)

`--color-text-muted: #a6a09b` on `--color-page-canvas: #f5f5f4` = **2.37:1**, under half the WCAG AA 4.5:1 minimum. Used across 40 files (~13x in MissionCard, ~16x in score.ts) for descriptions, metadata, placeholders, locked labels. Blocks the core reading task for low-vision users and reads washed-out in bright ambient light — the exact "calm but illegible" tell.
**Fix**: Darken `--color-text-muted` to ~`#6b6561` (5.26:1) or `--color-text-subtle: #57534d` (7.0:1) for body text; reserve #a6a09b for purely decorative non-text only.
**Suggested command**: /impeccable audit

### [P0] Score conveyed by color alone

Score badges shift green/yellow/red with no text label or icon pattern. Violates the product's OWN accessibility principle ("color is never the sole carrier of meaning") and fails for colorblind users (~8% of the male audience). Meaning also undocumented — is 72 good or mediocre?
**Fix**: Add a short label or tier word inside/next to the badge ("Excellent" / "Good" / "Low") plus a tooltip explaining the breakdown. Externalise the scale so users don't memorise it.
**Suggested command**: /impeccable clarify

### [P1] FilterBar decision paralysis (15 simultaneous controls)

7 platform pills + 5 duration pills + 3 toggles shown flat, no grouping, no defaults. Nearly 4x the ≤4 visible-options guideline. On a ~600px sidepanel it eats the top ~17% of the viewport with secondary UI.
**Fix**: Group into collapsible "Platforms / Budget / Context" sections; collapse secondary platforms behind "Show more"; surface active filters as dismissible chips when collapsed.
**Suggested command**: /impeccable layout

### [P1] No error recovery for hidden missions

Hide is immediate, irreversible, and easy to fat-finger. No undo, no "Hidden (5)" view, no recovery short of clearing storage. Users can't reconsider a rejected mission.
**Fix**: Toast with "Undo" (5s) on hide, or a "Hidden" filter/tab in the FeedPage header.
**Suggested command**: /impeccable harden

### [P2] Scan errors shown but not actionable

"2 platforms failed" displays in red with no retry, no per-platform detail, no explanation. Triggers anxiety, offers no resolution.
**Fix**: Make the failure line clickable → modal with per-platform status + "Retry all"; or inline retry icons per failed connector.
**Suggested command**: /impeccable harden

## Persona Red Flags

**Alex (Power User — keyboard/density)**: FilterBar pills require Tab-through-all-15 (no roving tabindex, no arrow-key nav). No keyboard shortcut to open/hide a mission from a focused card. Virtual scrolling handles volume well.

**Jordan (First-Timer)**: OperationalEmptyState says "No missions found" with no explanation of whether platforms are connected, when scans run, or whether filters are too narrow. Score scale has no legend. Premium-locked filters toggle silently — click, nothing happens, no tooltip.

**Sam (Screen Reader / Low Vision)**: Mission descriptions at 2.37:1 are unreadable even magnified. Score color not announced. ARIA labels present on some icons (good) but inconsistent; filter pills lack `aria-pressed`, so active-filter state is invisible to NVDA.

## Minor Observations

- LastScanInfo "X minutes ago" updating per-second may cause unnecessary re-renders; minute granularity suffices.
- Search lacks debouncing — filterMissions runs every keypress; add ~300ms.
- Stack tags wrap and can push TJM/location offscreen on 400px width; consider "+3 more" truncation.
- Connection status dot has no tooltip — cryptic for first-timers.
- Premium lock badge placement (top-right overlap) reads as afterthought; integrate as a status chip.

## Questions to Consider

1. Should filters be hidden by default and revealed only when search/scoring isn't enough? Front-load the ranked feed; treat filtering as a fallback, not the chrome.
2. Is the single 0-100 score a crutch? Would 3 mini-bars (Match / Rate / Context) — or an inline "+20 stack, +10 location, -5 rate" breakdown on hover — build more trust than an opaque number?
3. Why optimise for Hide when the goal is to Apply? Could low-score missions auto-collapse into a "Not recommended" section, removing the Hide action entirely and celebrating high-matches instead?
