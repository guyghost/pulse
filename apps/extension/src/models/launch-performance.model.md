# Launch & Page-Load Performance — Model (source of truth)

This document is the **authoritative spec** for the side panel's launch and
page-navigation performance. It defines the measurable phases, the events that
mark transitions between them, the budget per phase, the invariants, and the
**reproducible measurement protocol** used to verify every change.

Rule: _"Si le comportement ne peut pas être modélisé, il n'est pas prêt à être
implémenté."_ There is **no LLM** anywhere in this flow. Performance is a pure
function of asset size, parse/compile cost, and execution order — all
deterministic and measurable.

## 1. Why a model

The <50 ms/page target is only meaningful against a **precise definition of
"loaded"**. A side panel has three distinct user-visible moments, each with a
different cost structure and a different feasibility ceiling. Optimizing
without naming the moment produces numbers that don't compare across runs.

The model pins each moment to a **performance mark** so measurements are
reproducible and comparable.

## 2. Scope

Applies to the **side panel** surface (`src/sidepanel/index.html`), which is
the only user-visible document. The service worker (`src/background/index.ts`)
has its own boot budget (Section 7) but is not "loaded" by the user — it is
pre-emptively spawned by Chrome.

Pages in scope (per `app-navigation.svelte.ts`):
`feed · profile · cv · applications · tjm · settings · onboarding`

## 3. Launch phases (states)

The side panel load is a strict sequence. Each row is a **state** with an
entry mark and an exit mark. "Loaded" is defined per phase.

| #   | Phase               | Entry mark        | Exit mark                              | What the user sees           |
| --- | ------------------- | ----------------- | -------------------------------------- | ---------------------------- |
| 0   | `shell-painted`     | `navigationStart` | `mp:shell` (inline script in `<head>`) | Skeleton card, brand eyebrow |
| 1   | `css-ready`         | `mp:shell`        | first paint of themed body             | Themed background            |
| 2   | `app-mounted`       | `mp:shell`        | `mp:app-mounted`                       | Nav bar + page shell (empty) |
| 3   | `page-chunk-loaded` | `mp:app-mounted`  | `mp:page:<id>`                         | Page component mounted       |
| 4   | `page-data-ready`   | `mp:page:<id>`    | `mp:page:<id>:data`                    | Page hydrated with real data |

**Definition of "page load <50 ms"** = phases 0→3 (shell → app-mounted → page
chunk loaded and mounted). Phase 4 (`:data`) is **out of scope** for the 50 ms
budget because it depends on async I/O (IndexedDB reads, scoring) whose latency
is bounded by storage, not by code we control. Phase 4 has its own budget
(Section 6).

## 4. Events (transitions)

Events are emitted by the runtime, not by the LLM. Each event advances the
phase machine. The orchestrator (`sidepanel/main.ts`) is the only emitter.

```
States:  shell-painted · css-ready · app-mounted · page-chunk-loaded · page-data-ready
Events:  CSS_READY · APP_MOUNTED · PAGE_CHUNK_LOADED(id) · PAGE_DATA_READY(id)
```

| From              | Event                 | To                | Emitted by                  |
| ----------------- | --------------------- | ----------------- | --------------------------- |
| shell-painted     | CSS_READY             | css-ready         | browser first paint         |
| css-ready         | APP_MOUNTED           | app-mounted       | `mount(App)` callback       |
| app-mounted       | PAGE_CHUNK_LOADED(id) | page-chunk-loaded | dynamic `import()` resolve  |
| page-chunk-loaded | PAGE_DATA_READY(id)   | page-data-ready   | page's data $effect settled |

Transitions are **monotonic**: the phase index only increases during a single
load. A `NAVIGATE` from `app-mounted` starts a new `page-chunk-loaded` cycle
for the target page id; it does NOT regress `app-mounted`.

## 5. Performance budgets (Chrome extension, local assets)

In a Chrome extension, all assets are served from `chrome-extension://` (no
network). The cost is parse + compile + execute. Budgets below are **p95 on
the reference machine**, measured headless via the protocol in Section 8.

| Phase                          | Budget | Current cost (proxy)     | Feasible <50 ms? |
| ------------------------------ | ------ | ------------------------ | ---------------- |
| 0 shell-painted                | ≤ 16   | ~5 (inline HTML/CSS)     | ✅ yes           |
| 1 css-ready                    | ≤ 20   | ~10 (11.72 kB gzip CSS)  | ✅ yes           |
| 2 app-mounted                  | ≤ 50   | 30–70 (39.64 kB gzip JS) | ⚠️ borderline    |
| 3 page-chunk-loaded (navigate) | ≤ 50   | 10–40 per page chunk     | ✅ yes (most)    |
| 4 page-data-ready              | ≤ 300  | async I/O bounded        | n/a (separate)   |

**Composite "open panel → feed mounted" = phases 0+1+2+3(feed).** Target ≤ 50 ms
is achievable ONLY if the critical-path JS (phase 2) is reduced and the feed
chunk is preloaded so phase 3(feed) overlaps phase 2.

The heaviest page chunks (raw bytes, pre-optimize):

| Page         | raw B  | gzip kB | Note                   |
| ------------ | ------ | ------- | ---------------------- |
| FeedPage     | 85 546 | 27.16   | Initial page; heaviest |
| SettingsPage | 59 014 | 15.28   | Lazy; ok               |
| CvPage       | 27 844 | 8.52    | Premium-locked         |
| Applications | 27 359 | 8.61    | Premium-locked         |
| TJMPage      | 22 832 | 7.40    | Premium-locked         |

## 6. Invariants

1. **No LLM in the critical path.** Gemini Nano scoring is phase-4 only and
   never blocks paint.
2. **Marks always emitted** — `mp:shell`, `mp:app-mounted`, `mp:page:<id>`,
   `mp:page:<id>:data` must exist in `performance.getEntriesByType('mark')`
   after load, in DEV and PROD.
3. **Shell is static HTML.** The skeleton must never depend on JS. If JS fails,
   the shell stays visible (graceful degradation).
4. **Phases are monotonic** during a single load (Section 4).
5. **Navigation never re-downloads the main chunk.** Only the page chunk moves.
6. **Budget regression fails CI.** The measurement harness asserts phase 3 ≤ 50
   ms per page; a regression is a build failure, not a warning.

## 7. Service worker boot budget (out of page-load scope)

The service worker boots independently and must reach "message-ready" within
**500 ms** (cold). This is verified separately and does NOT count against the
side panel's 50 ms budget. Tracked here for completeness.

## 8. Reproducible measurement protocol

To make runs comparable, every measurement uses the **same** conditions:

- **Build**: `pnpm build` (production, minified, tree-shaken). Never dev.
- **Server**: `vite preview` (serves `dist/`), or direct `chrome-extension://`
  load via Playwright `--load-extension`.
- **Browser**: Chromium headless, `--disable-extensions-except`, CPU throttling
  OFF (reference machine baseline), warm after 1 discarded throwaway run.
- **Chrome stub**: a minimal `chrome.*` stub injected via `addInitScript` so
  the bootstrap path doesn't hang on missing APIs. Same stub every run.
- **Iterations**: 10 cold navigations per page (context recreated each time),
  report **median + p95**, discard the first run.
- **Marks read**: `performance.getEntriesByName('mp:page:<id>')` minus
  `navigationStart`.

The harness lives at `tests/e2e/performance/page-load.test.ts` and emits a
JSON report written to `output/perf-report.json` for before/after diffing.

## 9. What is NOT measured here

- Runtime interactions after load (scroll, search, filter) — covered by
  `tests/e2e/performance/virtual-list.test.ts`.
- Service worker scan throughput — covered by scanner unit tests.
- LCP/CLS of marketing surfaces — N/A (this is a product surface).

## 10. Optimization decisions (source of truth for implementation)

The composite "open panel → feed mounted" (phases 0+1+2+3) must be ≤ 50 ms.
Baseline (build v0.2.2, warm profile, median of 8): `appMounted ≈ 68 ms`,
`feed cold ≈ 73 ms`. Both exceed 50 ms. Root cause isolated across **three
experiments** and recorded here as an invariant — it constrains all future work.

### 10.1 Root cause — V8 cold-compile floor (proven)

A diagnostic `mp:main-start` mark (fired after all static imports evaluated)
landed at **63 ms**; `mp:app-mounted` at **67 ms**. Mount execution is only
**~3 ms**. **95 % of boot time is V8 parse/compile/eval**, not Svelte mount.
This was confirmed by three independent chunk-splitting experiments:

| Experiment                             | appMounted | Verdict                                                                                  |
| -------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| Static `App` import, one 114 kB chunk  | 68.0 ms    | baseline                                                                                 |
| Dynamic `import(App)`                  | 73.9 ms    | **worse** (serial: entry must finish compiling before the dynamic import can even start) |
| `manualChunks` split + `modulepreload` | 68.2 ms    | neutral (V8 stream-compiles in parallel but total CPU compile time is unchanged)         |

At the measured **~0.55 ms/kB raw** compile rate, 114 kB ≈ 63 ms. To reach the
47 ms compile budget (50 ms − 3 ms mount) the critical-path JS would have to
shrink to **~85 kB raw** — a 25 % cut of the actual App graph (Svelte runtime +
template + organisms + state stores + transitions). This requires removing
first-paint features or a different architecture; relocating bytes does nothing.

**Invariant:** for this SPA running under MV3, every sidepanel open cold-compiles
the full App graph. V8's compiled-code cache does **not** warm across opens of
`chrome-extension://` documents (warm ≈ cold), so there is no steady-state win.

### 10.2 Inter-page navigation is already free (proven)

`App.svelte::loadPage` guards each page with `if (page === X && !XPage)`. With
`premium_enabled`, the boot preload effect imports **every** page chunk at 80 ms.
Once `XPage` is set, navigating to X calls `import()` again but `!XPage` is
false → the import is **skipped entirely**; the component is already in memory.
Navigation cost is therefore **~0 ms** (component reference swap), trivially
under the 50 ms budget for every page. The 50 ms target is **only** at risk on
the initial cold boot (feed).

### 10.3 Applied (shipped) optimizations

1. **CSP compliance (launch blocker)** — externalized inline `<script>` blocks
   into `shell-boot.ts`. MV3 `script-src 'self'` silently dropped them; the shell
   performance mark was broken in production. Fixed.
2. **`build.target: 'esnext'`** — Chrome-only, skip down-level.
3. **Phase-3 overlap** — `markImportStart('feed')` + `void import(FeedPage)` in
   `main.ts` before `mount(App)`; FeedPage chunk compiles during phase 2.
4. **Production-safe launch marks** — `launch-marks.ts` exposes
   `window.__mpPerf.getSnapshot()` so the harness measures without DEV mode.

### 10.4 Deferred / not pursued

- **Icon registry lazy-split** — already a separate lazy chunk; NOT on the
  critical path. No action.
- **`app-lifecycle.machine.ts` removal** — dead code (only imported by a test),
  lives in a lazy `xstate.svelte` chunk, NOT on the critical path. Safe cleanup,
  no perf impact.
- **Aggressive App-graph reduction** — the only lever that can break the floor;
  requires product-level decisions on which first-paint features to defer. Not
  undertaken without an explicit decision (see §12).

### 10.5 Open decision (requires owner)

The 50 ms boot target is **below the proven V8 compile floor** for the current
App complexity. Options on the table — none can be chosen by the model alone:
(a) accept a **~70 ms boot budget** (current, meets navigation budget for all
pages), (b) cut first-paint features to shrink the critical chunk to ≤ 85 kB,
(c) revisit the definition of "loaded" (e.g. shell-painted + nav visible, which
already meets budget). Tracked in §12.

## 11. Change log

| Date       | Change                                                                                                                                                                                                    | Author |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-07-05 | Initial model. Baseline captured from build v0.2.2.                                                                                                                                                       | model  |
| 2026-07-05 | §10 added: phase-3 overlap + phase-2 reduction plan.                                                                                                                                                      | model  |
| 2026-07-05 | CSP fix: externalized inline scripts → `shell-boot.ts`. Launch now PASS, 0 console errors.                                                                                                                | impl   |
| 2026-07-05 | §10.1–10.5 rewritten: V8 cold-compile floor proven across 3 experiments; inter-page nav proven free (preload-all + `!XPage` guard). esnext + phase-3 overlap shipped. manualChunks reverted (neutral).    | impl   |
| 2026-07-05 | §12 RESOLVED: owner accepts ~70 ms boot budget; navigations already ≤50 ms. Ship as-is. `mp:main-start` diagnostic removed, history instrumentation reverted. 1701 tests green, launch verified 0 errors. | impl   |

## 12. Boot budget — RESOLVED

> Owner decision recorded 2026-07-05.

**Decision: accept a ~70 ms boot budget. Ship as-is.**

Rationale (owner): the 50 ms target is met on **every inter-page navigation**
(Profil, CV, Suivi, TJM, Réglages — all ~0 ms via the preload-all design). The
**only** moment above 50 ms is the initial cold boot (open panel → feed mounted,
68–73 ms), which §10.1 proves is bounded below by V8's single-threaded cold
compile of the ~114 kB App graph (~63 ms). No byte-relocation strategy can break
that floor (3 experiments confirm). Cutting below 70 ms would require removing
first-paint features — not worth the UX cost for a single cold-open moment.

**Accepted budgets (final):**

- Initial cold boot (shell → feed mounted): **≤ 75 ms** (measured median 68–73).
- Inter-page navigation (any page, warm app): **≤ 50 ms** (measured ~0 ms).
- Shell painted + nav visible: already well under 50 ms.

If a future feature grows the critical chunk past ~130 kB raw (boot > 80 ms),
revisit §10.4(b): defer first-paint features to shrink below the floor.
