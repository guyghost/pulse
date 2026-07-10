# Notification Deep-Link — State Model

> Source of truth for the deep-link experience: when a notification fires (or
> the user opens the panel while notified missions exist), the feed focuses on
> those missions. Short rule: **the notification produces a focus intent; the
> model decides what the feed shows.**

Two cooperating state machines, one per context:

- **Intent** (service worker, `chrome.storage.session`) — what to show.
- **Focus** (side panel, `feed-page.svelte.ts`) — how the feed renders it.

---

## 1. Intent machine (service worker)

Persisted in `chrome.storage.session` under `deepLinkIntent`. Written when a
notification is created; read + cleared atomically when the panel mounts.

### States

| State      | Meaning                                        |
| ---------- | ---------------------------------------------- |
| `absent`   | No intent in storage. Default.                 |
| `pending`  | An intent is written, not yet consumed.        |
| `consumed` | Intent has been read and cleared by the panel. |

### Events

| Event           | From → To              | Side effect                                                       |
| --------------- | ---------------------- | ----------------------------------------------------------------- |
| `NOTIFY`        | any → `pending`        | overwrite storage with `{ focusMissionIds, source, triggeredAt }` |
| `CONSUME`       | `pending` → `consumed` | atomically read + remove from storage; return value to panel      |
| `CONSUME`       | `absent` → `absent`    | no-op, returns `null`                                             |
| `SESSION_RESET` | any → `absent`         | storage area cleared by browser                                   |

### Shape

```ts
type DeepLinkIntentSource = 'notification' | 'digest';
interface DeepLinkIntent {
  focusMissionIds: string[]; // non-empty, ≤ 20, deduped
  source: DeepLinkIntentSource;
  triggeredAt: number; // epoch ms
}
```

### Invariants (Intent)

- **I1 (single consume):** a given intent is returned to exactly one panel
  mount. `CONSUME` is atomic read-then-clear.
- **I2 (non-empty):** `NOTIFY` is only fired with ≥1 mission id; empty writes
  are dropped.
- **I3 (bounded):** `focusMissionIds` length ≤ 20 (display cap; mirrors
  `maxResults` ceiling).
- **I4 (latest wins):** a new `NOTIFY` overwrites a pending intent.
- **I5 (no leakage):** intent lives only in session storage; never persisted to
  disk, never logged with mission content.

---

## 2. Focus machine (side panel / feed-page)

Lives in `createFeedPageState()`. Drives `displayMissions` + the banner.

### States

| State       | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| `idle`      | No intent consumed; feed is normal.                      |
| `focused`   | Feed is filtered to the intent missions; banner visible. |
| `dismissed` | User dismissed; feed is normal again.                    |

The earlier `focusing` intermediate state was removed during implementation
(see "Race handling" below). `APPLY` enters `focused` optimistically and a
deferred effect re-checks the match once missions are available.

### Events

| Event           | From → To               | Side effect                                       |
| --------------- | ----------------------- | ------------------------------------------------- |
| `APPLY(intent)` | `idle` → `focused`      | set focus ids; banner + filter applied at once    |
| `APPLY(intent)` | `idle` → `idle`         | intent is null (nothing consumed)                 |
| `STALE_GUARD`   | `focused` → `idle`      | missions loaded but no intent id matches → revert |
| `DISMISS`       | `focused` → `dismissed` | clear focus ids; restore full feed                |

`STALE_GUARD` is a deferred `$effect`, not a message: it fires after the
async mission load settles, so a consumed intent survives until missions are
reactively present.

### Race handling

The panel consumes the intent on mount (async facade call) while missions load
async in parallel. Rather than an intermediate state, `APPLY` enters `focused`
optimistically (banner shows immediately, `displayMissions` filters at once)
and the `STALE_GUARD` effect re-checks the match once `missions.length > 0`.
This collapses the earlier `focusing` + `MISSIONS_LOADED` design into one state
and shows the banner without delay.

### Invariants (Focus)

- **F1 (override):** when `focused`, `displayMissions` shows only intent
  missions (still sorted), ignoring all other filters. Other filters are NOT
  mutated — dismissing restores the prior filter state untouched.
- **F2 (focus ≠ seen):** focus ids are matched against loaded missions by id,
  never against the seen set. Seen-marking at notify time does not affect focus.
- **F3 (dismissable):** `DISMISS` is always available in `focused`. It never
  mutates persisted filter state.
- **F4 (auto-expire):** once missions are loaded and no intent id matches, the
  `STALE_GUARD` effect reverts `focused` → `idle` (no empty feed, no dead lens).
- **F5 (single activation):** once `dismissed`, the panel does not re-enter
  `focused` without a new consumed intent (i.e. a new `NOTIFY` → `APPLY`).
- **F6 (scroll):** on `focused`, the feed scrolls the mission section into view.

---

## 3. Why seen-marking is decoupled

Today `persistScanResults` calls `saveSeenIds(markAsSeen(seenIds, notifiedMissionIds))`
at notify time. The legacy `showNewOnly` filter excludes seen missions, so
toggling it after a notification would hide the very missions we want to show.
The focus lens bypasses seen entirely (F2): focus is an explicit id allow-list
applied after the normal pipeline, so seen-marking becomes harmless to the
deep-link UX. We keep the seen-mark (it powers the badge/new-count correctly)
but it no longer dictates the focus surface.

---

## 4. Zero-LLM invariant

No state transition in either machine depends on an LLM. `filterSmartNotifications`
(used at notify time to pick which missions to surface) only filters by
score/stack/TJM thresholds — deterministic. The LLM never decides focus.
