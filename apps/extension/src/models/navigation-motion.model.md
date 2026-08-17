# Navigation Motion Model

Source of truth for the side-panel navigation presentation. The app-shell
model remains authoritative for bootstrap, route permission and lazy page
loading; this model owns only the deterministic projection of an accepted
route into expandable pills and page motion.

## Scope

The navigation keeps the six existing product destinations accessible:
`Missions`, `Profil`, `CV`, `Suivi`, `TJM` and `Réglages`. `Missions` keeps the
existing `feed` route identity; visible or accessible copy never changes that
canonical page value.

The visual contract is inspired by the selected MissionPulse storyboard:

- every destination is a separate pill;
- exactly one pill is expanded and shows its visible label;
- inactive pills are compact and icon-only;
- the newly selected page enters from the direction of its navigation index;
- the previously selected page leaves in the opposite direction.

This is a finite, synchronous presentation projection, not a long-running
business workflow. It therefore does not require a separate XState actor. The
existing `createAppNavigation` state module owns the accepted route and exposes
the projection consumed by the UI.

## State and context

```ts
type Page = 'feed' | 'profile' | 'cv' | 'applications' | 'tjm' | 'settings' | 'onboarding';
type PagePosition = 'before' | 'current' | 'after';
type NavigationMotionLifecycle = 'mounted' | 'disposed';

interface NavigationMotionContext {
  currentPage: Page;
  previousPage: Page;
  transitionDirection: -1 | 1;
  lifecycle: NavigationMotionLifecycle;
}
```

`transitionDirection` is `1` when the target page has a greater canonical
index than the current page and `-1` otherwise. `PagePosition` is derived by
comparing a rendered page with `currentPage`; it is never inferred from copy,
icons or DOM order.

## Events

```ts
type NavigationMotionEvent = { type: 'NAVIGATE'; page: Page } | { type: 'UNMOUNT' };
```

Only an app-shell `NAVIGATE` event that passed the existing `routeAllowed`
guard reaches this model.

## Transition table

| From                           | Event               | Guard                            | To         | Effects                                                                                            |
| ------------------------------ | ------------------- | -------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `mounted`                      | `NAVIGATE(target)`  | target differs and route allowed | `mounted`  | Compute direction, retain previous page, commit target page; CSS interpolates the new projections. |
| `mounted` during interpolation | `NAVIGATE(target)`  | target differs and route allowed | `mounted`  | Supersede the prior CSS destination and recompute from the currently committed page.               |
| any mounted                    | `NAVIGATE(current)` | same page                        | same       | No state or motion change.                                                                         |
| mounted                        | `UNMOUNT`           | —                                | `disposed` | Stop accepting events; DOM removal cancels any CSS interpolation.                                  |
| `disposed`                     | any                 | —                                | `disposed` | Ignore.                                                                                            |

## Rendering projection

For each destination pill:

- active iff its page equals `currentPage`;
- the navigation row consumes exactly 100% of the available inline space;
- every inactive pill uses the same responsive diameter, clamped between
  36 px and 40 px;
- the active pill has no visual maximum width and consumes all space remaining
  after the five inactive diameters and the five equal gaps are subtracted;
- outer padding is owned by the shell and is symmetric; the navigation never
  creates an additional trailing gap;
- active label has visible width and opacity;
- inactive label has zero visible width and is not exposed twice to assistive
  technology; the button keeps its full accessible name through `aria-label`;
- pill interpolation lasts 180 ms with an ease-out curve.

For each mounted page:

- `current` projects `translateX(0)` and is interactive;
- `before` projects to the negative horizontal side and is inert;
- `after` projects to the positive horizontal side and is inert;
- page interpolation lasts 220 ms with an ease-out curve;
- all page wrappers remain mounted so local state and scroll position survive
  navigation;
- hidden pages remain `aria-hidden` and `inert` for the entire transition.

When the CSS media query reports reduced motion, both durations collapse to
effectively zero and no intermediate transform is required. This preference is
a rendering input, not a route transition.

## Side effects

- The state module changes only ephemeral navigation state.
- The UI applies CSS width/opacity/transform transitions.
- Page imports, persistence, telemetry and bridge I/O stay owned by the app
  shell and are unchanged.
- Page motion never triggers a scan, a tracking transition or any persistence
  write.

## Error, permission, retry and cancellation review

- **Bootstrap error:** navigation remains disabled under the app-shell guard;
  no pill or page motion begins.
- **Page-load error:** the accepted route remains active and its error surface
  occupies the current page position; motion does not fabricate success.
- **Permission denial:** a permitted lock surface moves like any other accepted
  route; protected code is still gated by the app-shell model.
- **Retry:** retrying a page chunk does not change the active pill or direction.
- **Rapid navigation:** a new accepted navigation supersedes the previous CSS
  destination; there is no completion event capable of mutating route state.
- **Cancellation:** unmount discards all wrappers with the shell instance, so
  any in-flight CSS interpolation ends without a route-side callback.
- **Offline:** local navigation and motion remain available; network status does
  not choose a route.
- **Terminal state:** only `disposed` is terminal. `settled` is stable but
  accepts another explicit `NAVIGATE`.

## Forbidden transitions

- No navigation during app-shell `bootstrapping` or `error`.
- No transition to an unknown page.
- No state change when the active pill is selected again.
- No page direction derived from text labels, icons, LLM output or animation
  completion order.
- No hidden page may receive pointer, keyboard or accessibility focus.

## Invariants

1. Exactly one product destination is active when the shell is ready.
2. Exactly one destination pill is expanded.
3. The active basis, five inactive diameters and five gaps sum to the complete
   navigation content width at every supported panel width.
4. Every existing destination remains reachable and keeps its accessible name.
5. `PagePosition(page, currentPage)` is deterministic for every known page.
6. Motion changes presentation only; route and business state remain owned by
   the existing deterministic app-navigation model.
7. Reduced-motion users receive the same final state without meaningful
   animation.
8. An LLM never chooses a page, direction, duration or completion transition.

## Review result

- [x] Nominal forward and backward navigation are explicit.
- [x] Re-selection and rapid navigation supersession are explicit.
- [x] Bootstrap/page-load errors and retries keep deterministic ownership.
- [x] Permission, offline and reduced-motion behavior are covered.
- [x] Unmount cancellation and the terminal state are covered.
- [x] No existing destination is removed or hidden behind implicit copy.
- [x] Narrow and wide side-panel widths cannot leave unused navigation space or
      clip an inactive destination.
