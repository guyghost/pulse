# Keyboard Shortcuts Help — Interaction and Readability Model

This document is the source of truth for the keyboard-shortcuts help panel.
It models a presentational overlay only: it never registers, changes, or runs a
keyboard shortcut. The shortcut registry remains the authority for the list.

Rule: _"Si le comportement ne peut pas être modélisé, il n'est pas prêt à être
implémenté."_ There is no LLM in this flow.

## Scope

The panel is rendered by `KeyboardShortcutsHelp.svelte` and is controlled by
the `showShortcutsHelp` page state. It presents the currently registered
shortcuts, grouped by their declared category.

## State machine

```
States: closed · open

                 OPEN (? or help trigger)
  closed ─────────────────────────────────► open
                                               │
                  CLOSE_BUTTON · CLOSE_BACKDROP · ESCAPE
  closed ◄────────────────────────────────────┘
```

| From   | Event                                      | To     | Effect |
| ------ | ------------------------------------------ | ------ | ------ |
| closed | `OPEN`                                     | open   | Render the dialog, expose the registry snapshot, and move focus to its close control. |
| open   | `CLOSE_BUTTON`                             | closed | Set the bound `isOpen` value to `false`. |
| open   | `CLOSE_BACKDROP` (pointer target is scrim) | closed | Set the bound `isOpen` value to `false`. |
| open   | `ESCAPE`                                   | closed | Set the bound `isOpen` value to `false`. |
| open   | Any other key / a pointer inside the panel | open   | No state transition. |

`open` is not terminal: the panel may be opened again after any close. The
registered shortcuts themselves continue to be owned by
`shell/utils/keyboard-shortcuts.ts`; rendering the help must not mutate that
registry.

## Readability hierarchy

```
scrim (context only; visually de-emphasised)
└─ dialog surface (all help content; readable at AA contrast)
   ├─ header: icon, title, concise purpose, close action
   ├─ scrollable grouped list
   │  └─ category label → shortcut description → keyboard keycap
   └─ footer: typing caveat and acknowledgement action
```

The scrim and dialog surface are separate layers. The scrim dims the underlying
feed only. The dialog uses the design-system surface and semantic text tokens,
so title, section labels, descriptions, keycaps, and footer text never inherit
the scrim's low contrast.

## Invariants

- **I1 — Registry fidelity.** Every displayed item comes from
  `getRegisteredShortcuts()` and uses `formatShortcut()`. No UI-only shortcut
  can be invented or executed here.
- **I2 — Stable grouping.** Categories retain their declared order:
  Navigation, Actions, Recherche, Filtres, Aide, then Autres/alphabetical.
- **I3 — One clear reading path.** A category label precedes its rows; each row
  presents exactly one action description and one right-aligned keycap.
- **I4 — Contrast boundary.** No help text or control is placed directly on the
  translucent dark scrim. The dialog surface has an opaque background and a
  visible boundary/elevation token.
- **I5 — Closing is predictable.** Close button, acknowledgement button,
  backdrop click, and `Escape` all produce the same `open → closed` transition.
- **I6 — Context is preserved.** The feed is not mutated while the panel is
  open; closing restores the same feed state underneath.
- **I7 — Keyboard semantics.** The container exposes `role="dialog"`,
  `aria-modal="true"`, and an accessible title. Its close control has a clear
  accessible name and receives focus when the dialog opens.
- **I8 — Bounded scan distance.** The surface uses the available width in a
  narrow side panel, but is centered and constrained at wide widths so each
  action remains visually associated with its keycap.

## Review checklist

- Nominal: opening through `?` or the visible help trigger shows all registered
  categories and shortcuts.
- Error/empty: an empty registry renders an intentionally empty list area;
  closing still works.
- Cancellation: clicking inside the panel does not close it; clicking the scrim
  does.
- Retry: the panel may be opened immediately after closing without stale rows.
- Permissions: no Chrome permission, persistence, network call, or AI worker is
  involved.
- Terminal state: `closed` unmounts the dialog and leaves the feed untouched.

## Verification mapping

`tests/unit/ui/KeyboardShortcutsHelp.test.ts` verifies grouping, semantic dialog
structure, separate scrim/surface layering, and each supported closure path.
Visual browser inspection verifies the surface remains legible at narrow and
wide side-panel widths.
