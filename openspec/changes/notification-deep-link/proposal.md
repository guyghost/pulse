# notification-deep-link

## Why

When a MissionPulse notification fires, clicking it (or opening the panel) lands
the user on the generic feed. They have to hunt for the notified missions. We
want the panel to open focused on exactly the missions the notification
surfaced, with a clear way back to the full feed.

## What changes

- **New core module** `core/deep-link/deep-link-intent.ts` — pure helpers
  (`createDeepLinkIntent`, `selectFocusMissions`, `hasFocusMatch`). No I/O.
- **Shell storage** `session-storage.ts` — `getDeepLinkIntent`,
  `setDeepLinkIntent`, `clearDeepLinkIntent` (`chrome.storage.session`).
- **Bridge messages** `CONSUME_DEEP_LINK_INTENT` / `DEEP_LINK_INTENT_CONSUMED`
  (+ Zod schemas) so the panel can atomically read+clear the intent through the
  service worker, honoring single-consume.
- **Notification wiring** `notify-missions.ts` writes a focus intent at
  notification time (source `'notification'`).
- **Feed-page focus state** `feed-page.svelte.ts` — on mount, consume the
  intent; if it matches loaded missions, filter `displayMissions` to those ids
  and expose `focusMode` + `dismissFocus()`.
- **UI banner** `FeedPage.svelte` — dismissable banner above the mission feed.
- **Dev stub** `chrome-stubs.ts` — returns a determinable intent (null by
  default; a dev window event can inject one).

## Non-goals

- No backend, no telemetry, no persisted credentials.
- No change to the badge/new-count semantics.
- Daily-digest deep-link is typed (`source: 'digest'`) but not wired in this
  change.

## Model

Authoritative: `apps/extension/src/models/notification-deep-link.model.md`.
Two machines: Intent (SW: absent · pending · consumed) and Focus (panel:
idle · focused · dismissed). Key invariants: single-consume (I1), focus
overrides filters without mutating them (F1), focus != seen (F2), auto-expire
on empty match (F4).

## Tests

- `tests/unit/deep-link/deep-link-intent.test.ts` — pure helpers, mock-free.
- Manual visual: inject a dev intent, confirm banner + filtered feed, dismiss,
  confirm full feed restored, confirm re-mount without intent stays normal.

## Risk

- Race: panel consumes intent before missions are indexed -> handled by an
  optimistic `APPLY` (enter `focused` immediately) plus a deferred `STALE_GUARD`
  `$effect` that reverts to `idle` if no intent id matches once missions load (F4).
- Stale intent across a SW restart -> session storage cleared by browser on
  session end; in-session staleness handled by auto-dismiss.
