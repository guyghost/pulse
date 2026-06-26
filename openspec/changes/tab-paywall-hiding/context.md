# Context: tab-paywall-hiding

## Objective

Hide Profile, TJM, Suivi (Applications), and CV tabs behind a premium feature flag. These tabs are paid features that previously required authentication/payment.

## Constraints

- Platform: Web (Chrome Extension MV3)
- Offline first: yes
- Design System: Analytical Blueprint

## Decisions

| Decision                                  | Justification                                                  | Agent         |
| ----------------------------------------- | -------------------------------------------------------------- | ------------- |
| Hide 4 tabs behind isPremium              | User wants paid features behind paywall                        | @orchestrator |
| Use facade/bridge pattern for persistence | FC&IS architecture - side panel must go through service worker | @orchestrator |

## Tabs Hidden

| Tab                  | Page                               | Reason                        |
| -------------------- | ---------------------------------- | ----------------------------- |
| Profile              | `ui/pages/ProfilePage.svelte`      | Paid - previously needed auth |
| TJM                  | `ui/pages/TJMPage.svelte`          | Paid - previously needed auth |
| Suivi (Applications) | `ui/pages/ApplicationsPage.svelte` | Paid - previously needed auth |
| CV                   | `ui/pages/CvPage.svelte`           | Paid - previously needed auth |

## Architecture

```
premium.svelte.ts (state)
  → premium.facade.ts (facade)
    → bridge.sendMessage() (messaging)
      → background/index.ts (service worker)
        → chrome.storage.local ('premium_enabled')
```

## Files Created

| File                                      | Purpose                                       |
| ----------------------------------------- | --------------------------------------------- |
| `src/lib/state/premium.svelte.ts`         | Premium state store with `isPremium` getter   |
| `src/lib/shell/facades/premium.facade.ts` | Facade routing premium get/set through bridge |

## Files Modified

| File                                 | Change                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/sidepanel/App.svelte`           | Filter `visibleNavItems` based on `!premium.isPremium`, guard premium page renders |
| `src/lib/shell/messaging/bridge.ts`  | Added GET_PREMIUM_STATUS, PREMIUM_STATUS_RESULT, SET_PREMIUM, PREMIUM_SET          |
| `src/lib/shell/messaging/schemas.ts` | Added Zod schemas for premium messages                                             |
| `src/background/index.ts`            | Added handlers for GET_PREMIUM_STATUS and SET_PREMIUM                              |

## Artifacts Produced

| File              | Agent         | Status     |
| ----------------- | ------------- | ---------- |
| context-log.jsonl | @orchestrator | ✅ Created |
| context.md        | @orchestrator | ✅ Created |

## Inter-Agent Notes

<!-- No messages yet -->
