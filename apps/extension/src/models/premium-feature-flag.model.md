# Premium Feature Flag — modèle historique remplacé

> **Statut : remplacé.** La source de vérité du produit freemium est
> [`models/freemium-entitlement-provisioning.model.md`](../../../../models/freemium-entitlement-provisioning.model.md).

Ce document conserve uniquement le constat nécessaire à la migration. Il ne
doit plus guider une nouvelle décision d'accès, une interface ou un message
marketing.

## Comportement historique encore présent

- La constante core `PREMIUM_FEATURE_ENABLED` vaut `false`.
- Quand le flag est dormant, les surfaces anciennement gated sont
  déverrouillées.
- Quand le flag est actif, la garde repose sur le booléen local
  `premium_enabled`.
- Le side panel peut lire et écrire ce booléen via
  `GET_PREMIUM_STATUS` / `SET_PREMIUM`.
- Le handler `GENERATE_ASSET` consulte ce mécanisme avant d'appeler Gemini Nano.
- Le DevPanel permet de simuler les combinaisons flag/compte.

Deactivate the legacy local page paywall today while keeping its navigation
code testable behind a feature flag. The on-device Gemini Nano kit is a free,
local capability in every flag state. The remote Eve Copilot is a separate
product boundary: only its server entitlement and build-time rollout authorize
remote jobs; neither `premium_enabled` nor `premium_feature_enabled` is an
authority for Eve.

Ce comportement est une dette de migration. Il ne constitue pas un
entitlement : le client peut écrire la valeur et aucune autorité de paiement ne
la signe.

## Règles de migration

1. Ne pas activer ce flag en production pour lancer le nouveau Premium.
2. Construire d'abord l'autorité serveur, le ledger webhook et la projection
   versionnée définis par le modèle freemium.
3. Remplacer les messages locaux par la projection authentifiée.
4. Supprimer `SET_PREMIUM` des builds de production ; conserver un override
   strictement dev pour les scénarios QA.
5. Retirer le flag historique seulement après migration de toutes les surfaces
   et tests d'expiration, révocation et changement de compte.
6. Ne jamais migrer `premium_enabled === true` vers un entitlement payé.

Le LLM ne décide aucune transition dans l'ancien mécanisme ni dans sa migration.

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

| Surface                       | Location                       | Dormant behaviour            | Active behaviour                                   |
| ----------------------------- | ------------------------------ | ---------------------------- | -------------------------------------------------- |
| Nav lock indicator            | `sidepanel/App.svelte`         | Never shown                  | Shown for cv/applications/tjm when free user       |
| Page lock screen              | `sidepanel/App.svelte`         | Never shown                  | Shown when navigating to a gated page as free user |
| cv / applications / tjm pages | `sidepanel/App.svelte`         | Rendered (accessible)        | Rendered only when `canAccessPremium`              |
| Premium page preload          | `sidepanel/App.svelte`         | Preloaded (accessible)       | Preloaded only when `canAccessPremium`             |
| Local kit (`GENERATE_ASSET`)  | `background/index.ts`          | Allowed, no cloud send       | Allowed, no cloud send                             |
| Settings "Plan" display       | `ui/pages/SettingsPage.svelte` | Hidden / "Premium désactivé" | Shows "Premium local actif" / "Gratuit local"      |
| Dev generation stub           | `dev/chrome-stubs.ts`          | Returns mock local asset     | Returns mock local asset                           |
| Remote Eve Copilot            | `shell/copilot/`               | Server entitlement only      | Server entitlement only                            |

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
7. `GENERATE_ASSET` and its dev stub never read either legacy premium boolean;
   the local kit stays free and does not send candidate content to a backend.
8. Eve job creation never reads either legacy premium boolean. It requires the
   fail-closed Copilot rollout plus a fresh canonical server entitlement.

## Out of scope (deferred)

- Remote config / server-side feature flipping (the user will wire this later).
- A production UI to toggle the flag (only the DevPanel exposes it for now).
- Removing the premium code entirely — it stays dormant behind the flag.
