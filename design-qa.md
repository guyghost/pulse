# Design QA — MissionPulse source coverage bottom sheet

## Selected target

- User-selected concept: third connector-rich bottom sheet.
- Source image:
  `/Users/guy/.codex/generated_images/019fb802-2d4d-7980-867f-d62e0658c5e6/exec-b43111f3-d02e-44ce-b00a-c2b7f615cb31.png`
- Source dimensions: `847 × 1857`, equivalent to an approximately `420 × 920`
  CSS-pixel side panel at 2× density.
- Compared state: Feed visible behind a modal scrim, filter sheet open, every
  shipped connector represented by its logo, source coverage visible.

## Model and implementation review

- The source selector consumes the build-filtered connector catalog; excluded
  connectors cannot reappear in the sheet.
- Source filtering remains canonical and single-valued. With no selected source,
  every source contributing missions is marked as included. Selecting a logo
  filters to that source; selecting it again returns to all sources.
- Mission counts come from the existing deterministic Feed aggregate. Logo load
  failures fall back to connector initials. Neither signal can cause a state
  transition.
- The sheet now occupies 70% of the panel height and keeps a detached close
  control, centered handle, independently scrollable body and fixed completion
  footer.

## Fidelity review

- **Hierarchy:** title, quick filters, minimum grade/TJM, connector rail,
  coverage rows, informational summary and footer follow the selected concept.
- **Connector rail:** all six current connectors use their real catalog favicon,
  a compact label and an explicit included/selected marker.
- **Coverage:** up to four contributing sources are sorted by mission count and
  use native progress elements. Remaining zero-count connectors are summarized
  without implying an operational error.
- **Typography:** quick-filter labels and connector names were enlarged from the
  first implementation pass to remain readable at 360–420 px widths.
- **Tokens:** surface, border, text, selection and progress colors use the
  MissionPulse design system. No duplicate palette or decorative custom SVG was
  added.
- **Interaction:** live count, reset, completion, scrim, detached close and
  Escape semantics remain owned by the explicit filter-sheet model.

## Verification

- Focused filter model, Feed state and operational UI suites: 77 tests passed.
- Shared UI icon registry tests: passed.
- UI package typecheck and build: passed.
- Extension TypeScript and focused ESLint: passed.
- Production extension build: passed (450 modules transformed).
- Vite preview endpoint: HTTP 200 at
  `http://127.0.0.1:5176/src/sidepanel/index.html`.

## Visual automation note

The selected source was inspected at original resolution. The in-app browser
runtime refused a fresh DOM/screenshot pass for the local preview under its URL
security policy, so this file does not claim a browser-rendered pixel comparison
for the connector-rich revision. The existing preview remains open for direct
visual review.

final result: blocked by local-browser capture policy; implementation and static verification passed
