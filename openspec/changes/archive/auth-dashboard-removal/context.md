# Context: auth-dashboard-removal

## Objective

Remove authentication capability and all Dashboard-related UI from the Settings area.

## Constraints

- Platform: Web (Chrome Extension MV3)
- Offline first: yes
- Design System: Analytical Blueprint

## Decisions

| Decision                             | Justification                                         | Agent         |
| ------------------------------------ | ----------------------------------------------------- | ------------- |
| Remove auth capability from Settings | User requested complete removal of auth from Settings | @orchestrator |
| Remove Dashboard-connected sync UI   | User requested removal of all Dashboard info          | @orchestrator |

## Files to Remove

| File                                        | Reason                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `src/lib/core/types/auth.ts`                | Auth types (AuthStatus, AuthUser, PremiumStatus) |
| `src/lib/state/auth.svelte.ts`              | Auth state store (login, signup, logout)         |
| `src/lib/shell/auth/supabase-client.ts`     | Supabase client singleton                        |
| `src/lib/shell/auth/auth-storage.ts`        | Auth persistence                                 |
| `src/lib/shell/auth/premium-api.ts`         | Premium API calls                                |
| `src/lib/shell/sync/connected-dashboard.ts` | Dashboard sync gateway                           |
| `src/lib/shell/sync/favorite-missions.ts`   | Favorite sync to dashboard                       |

## Files to Modify

| File                                     | Changes                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| `src/ui/pages/SettingsPage.svelte`       | Remove auth store, AccountSection, dashboard sync section |
| `src/ui/organisms/AccountSection.svelte` | Remove login/signup form, premium UI                      |
| `src/background/index.ts`                | Remove auth and dashboard sync handlers                   |
| `src/lib/shell/messaging/schemas.ts`     | Remove auth and dashboard message schemas                 |
| `src/lib/shell/messaging/bridge.ts`      | Remove auth/dashboard variants from BridgeMessage union   |
| `src/dev/chrome-stubs.ts`                | Remove auth and dashboard stubs                           |

## Artifacts Produced

| File              | Agent         | Status     |
| ----------------- | ------------- | ---------- |
| context-log.jsonl | @orchestrator | ✅ Created |
| context.md        | @orchestrator | ✅ Created |

## Inter-Agent Notes

<!-- No messages yet -->
