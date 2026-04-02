# ADR-002: XState 5 for State Management

## Status
~~Accepted~~ **Superseded** (2026-04-02)

> **Note :** Cette ADR est historique. XState a été retiré du projet au profit des runes Svelte 5 (`$state`, `$derived`, `$effect`) dans `src/lib/state/*.svelte.ts`. Les machines d'état mentionnées ci-dessous n'existent plus dans le code.

## Context
Svelte 5 provides runes (`$state`, `$derived`) for reactive state, but MissionPulse has complex state transitions (scan lifecycle, connection monitoring, toast queues) spread across multiple Chrome contexts. Simple reactive stores lead to implicit state transitions and hard-to-reproduce bugs -- e.g., what happens when a scan fails while offline and a reconnection triggers mid-retry?

## Decision
Use XState 5 state machines as the primary state management layer, integrated via `@xstate/svelte`.

Three machines govern the application:

- **`feed.machine.ts`**: Manages mission loading lifecycle (`empty -> loading -> loaded | error`) with search filtering. Actions use pure helper functions (`recomputeFilteredMissions`).
- **`toast.machine.ts`**: FIFO notification queue with max capacity (5), auto-dismiss, and typed toast events. Pure `addToast` helper enforces limits.
- **`connection.machine.ts`**: Network status tracking (`unknown -> online | offline | slow | reconnecting`) using the actor model -- a `fromCallback` actor subscribes to browser connectivity events and sends typed events back to the machine.

## Consequences
- **Positive**: Every valid state transition is explicitly declared. Impossible states are impossible. Machines are testable by sending event sequences and asserting context.
- **Positive**: The actor model (`fromCallback`, `invoke`) maps naturally to Chrome extension patterns -- background subscriptions, async operations, cross-context communication.
- **Positive**: XState's `setup()` API in v5 provides full type safety for events, context, actions, and guards.
- **Negative**: Higher learning curve than Svelte stores. XState v5 is still maturing (some ecosystem gaps).
- **Negative**: Adds ~15KB to the bundle (acceptable for an extension not serving over the network).
