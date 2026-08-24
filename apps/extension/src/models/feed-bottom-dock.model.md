# Feed Bottom Dock — Presentation Model

> Source of truth for the feed's floating bottom dock. This is a synchronous
> presentation projection over the existing `feed-page` state (same nature as
> `navigation-motion.model.md`): no XState machine, no new business state — the
> dock derives everything from already-owned state and owns only its rendering.

## Scope

The feed exposes a **floating dock** anchored above the bottom edge of the
scrollable mission list. The dock is made of **three separate elements**,
each autonomous and individually crafted — never a unified bar:

1. a **search pill** (input, grows with content),
2. a round **filters button** (opens the filter sheet),
3. a round **activity button** (« détails opérationnels »).

The dock stays visible whenever the feed page is the current app page, floats
**above** the scrolling list (content scrolls underneath), and disappears with
the page when the feed becomes inactive.

## State and context

The dock owns no state. Everything is derived:

| Dock concern       | Owner (existing)                                      |
| ------------------ | ----------------------------------------------------- |
| Page visibility    | `app-navigation` — `{#if active}` mount of `FeedPage` |
| Search query       | `feed-page` state module                              |
| Filter sheet open  | `feed-filter-sheet.model.md` machine (`filterOpen`)   |
| Filter active flag | `feed-page` derived state (`filterActive`)            |
| Focus return       | `feed-filter-sheet.model.md` (Escape → trigger)       |

Contract: the dock's buttons may **call** existing actions (toggle sheet,
focus input) but never define new business transitions. No LLM, no free text,
no heuristic ever produces a dock state.

## Rendering contract — Liquid Glass, per element

Each of the three elements is an independent floating surface. Readability is
guaranteed over light, dark and saturated content, at rest, on hover and
while content scrolls underneath.

Per element:

- **Translucent surfacing layer**: background using the surface-white token at
  a bounded opacity (45–65%), so underlying content remains perceivable but
  never competes with foreground text.
- **Backdrop treatment**: `backdrop-blur` plus `backdrop-saturate` on the same
  element, dosed so scrolled content blurs into a coherent tint instead of
  sharp noise (blur ≥ 16 px, saturate ≥ 150%).
- **Hairline definition**: a 1 px light border (white ≈ 70% opacity) around
  the full element, keeping each silhouette crisp and preventing visual
  fusion between neighbouring elements.
- **Specular top edge**: an inset top highlight (white gradient/line at high
  opacity) simulating light grazing the top rim of the glass.
- **Layered elevation**: two stacked shadows — a large diffuse shadow (soft,
  low opacity, large blur) and a tighter contact shadow (small offset, higher
  opacity) — so the element visibly lifts off the content.
- **State harmonization**: hover / active / focus-within adjust opacity and
  shadow intensity within the same glass language (slightly more opaque, one
  notch more shadow); focus-within also shows the accessible focus ring.

The three elements share the same calibration language (same border, shadow
stack, blur treatment) while remaining visually distinct, separated surfaces —
a **notion of stacked glass chips**, not one bar.

## Interaction contract

- Search input: standard text input behaviour, owned by `feed-page` query
  state; typing never triggers navigation or sheet transitions.
- Filters button: dispatches the existing `feed-filter-sheet` open event;
  `aria-expanded` reflects the machine state; `aria-controls="filter-panel"` is
  preserved; Escape closes the sheet and **returns focus to the filters
  trigger** (existing behaviour, now guaranteed by contract).
- Filters button badge: a small active-dot is shown when `filterActive` and
  the sheet is closed — purely derived.
- Activity button: opens the existing operational details surface. No new
  transitions.

## Z-order and layout

- Dock z-order stays **below** the filter sheet overlay (sheet renders above
  the dock when open).
- The mission list reserves bottom padding (`pb-28` / `pb-40`) so the last
  items are never permanently masked by the dock.
- The dock never overlaps the filter sheet trigger semantics; when the sheet
  is open the dock remains rendered underneath.

## Side effects

- None beyond existing `feed-page`/filter-sheet actions invoked by user
  interaction. The dock itself performs no I/O, no persistence, no bridge
  calls.

## Error, permission, retry and cancellation review

- **Filter sheet error states**: owned by the filter-sheet model; the dock
  stays stable and re-focusable.
- **Empty/long search input**: pure `feed-page` derivation; the pill grows,
  the two round buttons keep fixed size.
- **Feed inactive**: the dock unmounts with the page (existing `{#if active}`);
  no orphan element survives.
- **Rapid open/close of sheet**: machine-owned; dock only mirrors `aria`
  state.
- **Reduced motion**: dock has no entrance/exit animation requirement; only
  existing page transition rules apply.

## Forbidden

- No unified bar merging the three elements.
- No dock state derived from LLM output or free text.
- No direct `chrome.*`/IndexedDB access from dock handlers (all through
  existing state modules / bridge).
- No masking of list content without padding reservation.
- No new focus-trap: Escape/focus behaviour stays owned by the filter-sheet
  model.

## Invariants

1. The dock renders iff the feed page is the current app page.
2. The dock always consists of exactly three separate, individually bordered
   and shadowed elements.
3. Every element keeps its backdrop-filter, hairline border and layered
   shadows in every state (rest, hover, active, focus-within, scrolling
   underneath).
4. Surfacing opacity stays within the bounded range on every element.
5. Escape with the filter sheet open closes the sheet and restores focus to
   the filters trigger.
6. The mission list's effective bottom padding always clears the dock's
   height.
7. All dock button states derive exclusively from `feed-page` and
   filter-sheet state.

## Review result

- [x] Nominal, hover, active, focus states covered per element.
- [x] Visibility vs page-active and vs filter-sheet z-order covered.
- [x] Escape/focus-return and badge derivation covered.
- [x] No new business state; all derivations traced to existing owners.
- [x] Readability over light/dark/saturated content addressed by bounded
      opacity + blur + saturate contract.
