# Design QA — MissionPulse structured filter popover

## Comparison target

- User reference: `/var/folders/1t/456kc0651bl7mgrc62_m43g80000gn/T/codex-clipboard-e2cede2b-db0a-48ad-8362-0ce1760530e4.png`
- Normalized reference: `/Users/guy/.codex/visualizations/2026/07/31/019fb802-2d4d-7980-867f-d62e0658c5e6/missionpulse-structured-filter-reference-420x920.png`
- Final implementation: `/Users/guy/.codex/visualizations/2026/07/31/019fb802-2d4d-7980-867f-d62e0658c5e6/missionpulse-structured-filter-implementation-420x920.png`
- Side-by-side comparison: `/Users/guy/.codex/visualizations/2026/07/31/019fb802-2d4d-7980-867f-d62e0658c5e6/missionpulse-structured-filter-comparison-840x920.png`

## Normalization and state

- Reference pixels: `847 × 1857`, normalized to the `420 × 920` CSS viewport.
- Implementation viewport: `420 × 920`, browser density 1.
- Compared state: filter popover open with minimum grade `A`, minimum TJM
  `500 € / j`, source `Free-Work` and a live result count.
- The local-only `QA` and `DEV` launchers are excluded from findings because
  they are tree-shaken from the production extension.

## Fidelity review

- **Structure:** the popover now follows the reference hierarchy exactly:
  title and close control, three quick pills, divider, explicit rows for grade,
  TJM and source, reset/finish actions, then the centered live count.
- **Typography:** existing Geist UI typography preserves the source hierarchy;
  row labels, select values and secondary count copy remain legible at side-panel
  sizes.
- **Spacing and shape:** thin dividers, rounded select controls, compact pills
  and restrained neutral borders reproduce the reference content while keeping
  the previously approved floating popover geometry.
- **Motion connector:** the genie tail is narrower and lower contrast than the
  first pass, with a minimal shadow so it reads as a subtle origin cue instead
  of a large speech-bubble base.
- **Colors:** neutral surfaces, blueprint-blue selected/action states and the
  existing accent-green result indicator use MissionPulse design tokens.
- **Icons:** all visible symbols use the existing `@pulse/ui` icon set. The
  source row uses the closest available database/source icon; no custom SVG,
  emoji or placeholder art was introduced.
- **Content:** real mock missions and counts remain data-driven. Their values
  intentionally differ from the static reference, while labels and filter
  values match it.

## Interaction and model review

- Quick pills toggle `Prioritaires`, `Remote` and `Nouvelles` through typed
  model events.
- Grade, TJM and source controls are native selects with accessible names and
  immediate deterministic filtering.
- The explicit TJM minimum is a modeled positive whole-euro value. Invalid,
  non-finite or non-positive values are rejected; accepted values emit exactly
  one `SYNC_FILTERS` command.
- An explicit TJM minimum and the existing negotiation preset cannot be active
  as competing authorities.
- Reset updates every filter and count live. Close, scrim, Escape and page-hide
  dismiss without replaying or rolling back synchronized values.
- The production feed projection filters missions with a known TJM at or above
  the selected minimum.

## Responsive and accessibility evidence

- Verified at `360 × 780`, `420 × 920` and `520 × 920`; the popover and dock
  remain within the viewport with no horizontal overflow.
- At 360 px the quick pills compact their icon/text spacing without changing
  their native button behavior; the three structured rows remain fully visible.
- Focus moves to the outline-free popover container on open and returns to the
  filter trigger on close.
- Reduced-motion mode removes animation duration without changing state or
  filter results.
- Final browser console check: zero errors.

## Comparison history

### Pass 1 — blocked

- P2: the six large tiles did not match the new reference content.
- P2: the genie tail was visually heavy and competed with the dock.
- Fix: replaced the tile grid with the reference pills and structured rows;
  narrowed and softened the connector.

### Pass 2 — blocked

- P2: the TJM select lost its visible value after a hot component reload because
  dynamic option values were numeric while the select value was a string.
- Fix: normalized option values to strings while the model continues to receive
  a validated number.

### Pass 3 — passed

- The final side-by-side comparison shows the requested content, ordering,
  dividers, selectors, actions and count with no P0, P1 or P2 finding remaining.

## Verification

- Model and feed-state Vitest: 30 tests passed.
- TypeScript: passed.
- Focused ESLint: passed with zero errors.
- Production Vite build: passed (450 modules transformed).
- Browser console: zero errors.

final result: passed
