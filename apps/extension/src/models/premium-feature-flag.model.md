# Premium Feature Flag — State Model (source of truth)

This document is the **authoritative spec** for deactivating the premium system
in the extension via a feature flag, and for re-enabling it later via feature
flipping.

Rule: _"Si le comportement ne peut pas être modélisé, il n'est pas prêt à être
implémenté. Si une transition d'état dépend d'un LLM, l'architecture est
incorrecte."_ There is **no LLM** anywhere in this flow. The gating decision is
a pure function; the shell reads the flag value and applies the effect.

## Goal

Deactivate **all** premium functionality in the extension today (everything
unlocked, no paywall), while keeping the premium code intact behind a feature
flag so it can be re-enabled later via feature flipping. For development, every
surface must remain testable — including the dormant and active states.

## Flag states

The premium feature has two modes controlled by a single boolean flag
`premiumFeatureActive`:

| Mode    | `premiumFeatureActive` | Effect                                                               |
| ------- | ---------------------- | -------------------------------------------------------------------- |
| DORMANT | `false` (default)      | Premium system deactivated. All gated surfaces unlocked. No paywall. |
| ACTIVE  | `true`                 | Premium system enabled. Gating applies based on user's `isPremium`.  |

**Default is DORMANT.** The default lives in core as a pure constant
(`PREMIUM_FEATURE_ENABLED = false`) so it is the source of truth for production.

## Pure decision (core)

`shouldPremiumGate(featureActive: boolean, isPremium: boolean): boolean`
located in `src/lib/core/features/flags.ts`.

```
shouldPremiumGate = featureActive && !isPremium
```

Truth table:

| `featureActive` | `isPremium` | `shouldPremiumGate` | User-visible effect           |
| --------------- | ----------- | ------------------- | ----------------------------- |
| `false`         | \_          | `false`             | Everything unlocked (dormant) |
| `true`          | `true`      | `false`             | Premium user — unlocked       |
| `true`          | `false`     | `true`              | Free user — gates apply       |

A second pure accessor `canAccessPremium(featureActive, isPremium)` returns
`!shouldPremiumGate(...)` and is the single expression every UI surface uses to
decide whether premium pages/features are reachable.

## Surfaces affected

| Surface                           | Location                       | Dormant behaviour            | Active behaviour                                   |
| --------------------------------- | ------------------------------ | ---------------------------- | -------------------------------------------------- |
| Nav lock indicator                | `sidepanel/App.svelte`         | Never shown                  | Shown for cv/applications/tjm when free user       |
| Page lock screen                  | `sidepanel/App.svelte`         | Never shown                  | Shown when navigating to a gated page as free user |
| cv / applications / tjm pages     | `sidepanel/App.svelte`         | Rendered (accessible)        | Rendered only when `canAccessPremium`              |
| Premium page preload              | `sidepanel/App.svelte`         | Preloaded (accessible)       | Preloaded only when `canAccessPremium`             |
| Kit generation (`GENERATE_ASSET`) | `background/index.ts`          | Allowed (no gate)            | Returns `PREMIUM_REQUIRED` when free user          |
| Settings "Plan" display           | `ui/pages/SettingsPage.svelte` | Hidden / "Premium désactivé" | Shows "Premium local actif" / "Gratuit local"      |
| Dev generation stub               | `dev/chrome-stubs.ts`          | Returns mock asset (no gate) | Respects gate (returns `PREMIUM_REQUIRED` if free) |

## Runtime flag value — where it comes from

| Context       | Source                                                            |
| ------------- | ----------------------------------------------------------------- |
| Production UI | core constant `PREMIUM_FEATURE_ENABLED` (via `features` store)    |
| Production SW | `chrome.storage.local['premium_feature_enabled']` ?? constant     |
| Dev UI        | dev override `localStorage['__missionpulse_dev_premium_feature']` |
| Dev SW (stub) | dev storage key, seeded from the same dev localStorage key        |

The `features` store (`src/lib/state/features.svelte.ts`) is the runtime holder
for the UI. It initialises from the core constant and, in dev only, reads an
override from `localStorage`. Production never reads the override.

## Dev toggle (test everything)

The DevPanel exposes a Premium control with three deterministic scenarios,
applied on reload (same pattern as QA seed):

| Scenario          | `premium_feature` | `premium_enabled` | Purpose                                  |
| ----------------- | ----------------- | ----------------- | ---------------------------------------- |
| Dormant (default) | `false`           | `true`            | Everything unlocked; gating code dormant |
| Active — Premium  | `true`            | `true`            | Premium user; gating live, unlocked      |
| Active — Gratuit  | `true`            | `false`           | Free user; locks + `PREMIUM_REQUIRED`    |

This lets development exercise every state: all features accessible (dormant),
premium-unlocked (active + premium), and the paywall/lock UI (active + free).

## Invariants

1. When `premiumFeatureActive === false`, **no** surface is gated. `isPremium`
   is irrelevant to access decisions.
2. The flag default is the core constant `PREMIUM_FEATURE_ENABLED = false`.
3. Runtime override is **dev-only** (`import.meta.env.DEV`). Production uses the
   constant; the `chrome.storage` key is absent by default.
4. The pure decision lives in **core**; the flag value is read from core
   (production) or dev override (development). Core never imports shell.
5. No LLM decides gating. The flag is a boolean; transitions are explicit.
6. The existing premium infrastructure (store, facade, bridge messages, SW
   handlers) is preserved unchanged — only the **gating sites** consult the
   flag. This keeps feature flipping ready for later re-enablement.

## Out of scope (deferred)

- Remote config / server-side feature flipping (the user will wire this later).
- A production UI to toggle the flag (only the DevPanel exposes it for now).
- Removing the premium code entirely — it stays dormant behind the flag.
