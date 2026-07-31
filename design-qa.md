# Design QA — MissionPulse option 1

## Comparison target

- Selected option-1 visual:
  `/Users/guy/.codex/generated_images/019fb802-2d4d-7980-867f-d62e0658c5e6/exec-d4a97a17-c345-4c74-809c-2d6135598d71.png`
- Final closed implementation:
  `/Users/guy/.codex/visualizations/2026/07/31/019fb802-2d4d-7980-867f-d62e0658c5e6/missionpulse-option1-final-v3-420x920.png`
- Final open filter sheet:
  `/Users/guy/.codex/visualizations/2026/07/31/019fb802-2d4d-7980-867f-d62e0658c5e6/missionpulse-option1-filter-final-v4-420x920.png`

The source and both final implementation states were inspected together in the
same comparison input after the final CSS and interaction changes.

## Normalization and state

- CSS viewport: `420 × 920` for the primary comparison.
- Source pixels: `848 × 1856`, normalized to approximately `424 × 928` (the
  source is effectively a 2× rendering of the target side-panel composition).
- Implementation pixels: `420 × 920`, browser density 1.
- Theme: MissionPulse Analytical Blueprint light.
- Data: ten realistic local development missions; row copy and counts are
  intentionally data-driven rather than frozen to the source's sample values.
- Development-only `QA` and `DEV` launchers overlap the outer edges of the nav
  in local captures. They are removed by the production build and are excluded
  from fidelity findings.

## Full-view and focused evidence

- Full closed state: `missionpulse-option1-final-v3-420x920.png`.
- Full open state: `missionpulse-option1-filter-final-v4-420x920.png`.
- Focused surfaces inspected at original resolution: full-width expandable nav,
  the three discovery cards, the rounded `Pour vous` group, the MissionPulse
  action card, and the filter sheet's header, presets, rows and CTA.

## Required fidelity surfaces

- **Fonts and typography:** existing Geist UI typography is retained. Regular,
  medium and semibold weights preserve the source hierarchy. Long real mission
  titles truncate cleanly without changing row height; navigation labels do not
  wrap when their pill expands.
- **Spacing and layout:** the navigation spans the exact 16 px side gutters. The
  active pill consumes the remaining row width while five inactive pills stay
  circular. Discovery cards, the single rounded mission group, the action card
  and the sheet now follow the source's compact vertical order without the prior
  artificial 240 px gap.
- **Colors and tokens:** neutral fills, blue status dots, the amber action strip
  and blue CTA use existing design tokens. Scrim opacity preserves background
  context without competing with the sheet.
- **Image and asset quality:** the target contains no raster product imagery.
  Every visible icon comes from the existing `@pulse/ui` icon family; there are
  no emoji, custom SVGs, CSS drawings or placeholder assets.
- **Copy and content:** `Missions`, `À voir`, `Pour vous`, `Filtrer les missions`,
  the quick presets, three compact filter rows, `Réinitialiser` and the CTA map
  to the chosen visual. Mission names, locations and counts remain realistic
  local data.
- **Shape and surfaces:** navigation pills, 12–16 px card radii, thin dividers,
  the grouped recommendation border, top-only sheet radius and soft shadows
  match the selected direction rather than generic card defaults.

## Responsiveness and accessibility

- Verified at `360 × 780`, `420 × 920` and `520 × 920`; no horizontal document
  overflow occurred.
- At 360 px, nav button widths settled to `121 / 36 / 36 / 36 / 36 / 36`; at
  520 px they settled to `229 / 44 / 44 / 44 / 44 / 44`. In both cases the nav
  filled its available width with exactly one expanded destination.
- Filter trigger, close control, presets, rows, reset and CTA are native buttons
  with accessible names and selected/expanded states.
- Keyboard navigation reaches the filter trigger. `Escape`, close and scrim
  dismiss without committing; focus returns to the trigger when available.
- Reduced-motion classes retain final states while removing transition duration.
- The sheet body scrolls independently when `Plus de critères` is expanded, so
  small-height panels retain the primary CTA.

## Interaction evidence

- Nav active-pill CSS transition: `0.18s`, covering flex basis/grow, padding, gap,
  color and transform.
- Page transition: `0.22s` transform/opacity swipe. `Profil` became the sole
  `aria-current="page"` destination, then keyboard navigation returned to
  `Missions`.
- Primary nav geometry at 420 px: nav `x=16`, width `388`, right edge `404`;
  active Missions pill `146.5` px; five inactive pills `42` px each.
- Filter draft preview changed the CTA from `Afficher 10 missions` to
  `Afficher 1 mission` for the priority preset, then back to `Afficher 10
missions` on reset while the background feed remained unchanged.
- Applying closes the sheet and commits once. A subsequent note edit dismissed
  with `Escape` did not alter the previously committed mission set.
- Browser console after the final primary flow: zero errors.

## Comparison history

### Pass 1 — blocked

- P1 behavior/fidelity: the first sheet exposed every filter as chip grids and
  occupied most of the viewport, unlike the compact three-row selected visual.
- P2 layout: the sheet began around 55% of the viewport and obscured the intended
  relationship between recommendations and the action card.
- Fix: projected the same deterministic draft into three compact summary rows,
  kept additional criteria behind controlled disclosure, and reduced the sheet
  to the selected bottom-overlay proportion.

### Pass 2 — blocked

- P2 spacing: the MissionPulse action card was separated from `Pour vous` by an
  explicit 240 px margin, so the closed screen and overlay background did not
  match option 1.
- P2 interaction copy: the CTA count reflected committed filters instead of the
  current draft.
- Fix: reduced the gap to 32 px, compacted the top rhythm, and added a pure draft
  count projection without mutating the committed feed.

### Pass 3 — passed

- The three source rows are fully visible in the collapsed sheet.
- The action card follows the recommendation group and remains visible behind
  the overlay as context.
- Nav, grouped rows and sheet geometry now preserve the selected option's visual
  hierarchy across all checked widths.

## Accepted product adaptations

- Real MissionPulse data replaces the source's fixed sample counts and mission
  names.
- `Plus de critères` preserves existing remote, seniority and stack filtering
  without cluttering the option-1 default sheet.
- Existing search, sort and operational feed controls remain directly below the
  selected first-view composition rather than being removed.

## Verification

- TypeScript: passed.
- Focused ESLint: passed with zero errors.
- Focused Vitest: 95 tests passed across six files.
- Production Vite build: passed (449 modules transformed).
- `git diff --check`: passed.
- Chrome console: zero errors.

No actionable P0, P1 or P2 design findings remain.

final result: passed
