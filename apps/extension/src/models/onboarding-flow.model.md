# Onboarding Flow — State Model

> Authoritative prose model for the end-to-end onboarding UI flow. The machine
> in `onboarding-flow.machine.ts` (+ `.contract.ts`, `.logic.ts`) is the
> executable form of this document. If the two disagree, **the model is wrong**.

## Purpose

Take a first-run user from "extension installed" to "first scan running" without
ever blocking the delivery of first value. The flow collects the minimum
profile signal needed to score missions, asks for one connected source, and
launches a scan — even if the user skips every question.

## Scope

- **In scope:** UI phase orchestration (welcome → connect → wizard → notify →
  persist → scan → done), step validity guards, the `pendingEffect` protocol
  that the shell consumes to run persist/scan.
- **Out of scope:** durable source consent + permissions + session detection
  (owned by `onboarding-source.machine.ts`, reused as-is), credential storage
  (none — local-first), OTP/compliance (none — cookie-based sessions).

## Phases (states)

```
welcome ──START──▶ connecting ──NEXT(hasSource)──▶ wizard ──NEXT(lastStep)──▶ notifying
   │                   │                              │                            │
   │                BACK                             BACK                         NEXT
   │                   ▼                              │                            ▼
   │                welcome ◀─────────── BACK(first)──┘                        persisting
   │                                                                              │
   └──────────SKIP──────────────────────────────────────────┬─SKIP───────────────┤
                           │                                │                   │
                           ▼                                ▼                   ▼
                         scanning ◀──PERSISTED/PERSIST_FAILED──── persisting ◀──┘
                           │
                      SCAN_DONE / SCAN_FAILED
                           ▼
                       completed (final)
```

`wizard` is a **flat** state: `context.wizardStep ∈ {identity, preferences, skills}`
is the single source of truth. The top-level **phase is derived from the actor's
state value** (`phaseFromStateValue`), so context and active state can never
desync.

## Invariants (binding)

1. **Never block first value.** A scan always runs. The only terminal besides
   `completed` is `skipped`, which _also_ runs a partial scan first. There is
   no aborted dead-end.
2. **Idempotent terminal.** `completed` and `skipped` are XState `final`
   states. No event is admitted after the terminal is reached.
3. **One primary action per screen.** Each phase has at most one forward (NEXT)
   and one back (BACK); SKIP is the only escape hatch.
4. **Guards decide, components don't.** `canAdvanceStep` (pure, in contract) is
   the sole arbiter of whether NEXT is enabled on a wizard step. The UI never
   invents a transition.
5. **Effects are descriptors, not executions.** The machine writes a pure
   `OnboardingFlowEffect` into `pendingEffect`; the shell reads it, runs the
   I/O, and reports back via `SCAN_DONE` / `SCAN_FAILED` / `PERSISTED` /
   `PERSIST_FAILED`. The machine never calls fetch/storage/chrome.*.
6. **Admitted events only.** Events created by the controller are tagged via a
   `WeakSet` owned by the **machine module** (not `logic.ts`); the controller
   calls `admitFlowEvent(event)` before dispatching, and the `admittedEvent`
   guard reads the same set via the closure passed to
   `createOnboardingFlowSetup`. Splitting the writer and reader across two
   modules (two disjoint sets) silently rejects every event — this is a
   load-bearing invariant: **one set, one module**.

## Wizard step validity (`canAdvanceStep`)

| Step        | Guard                                              |
| ----------- | -------------------------------------------------- |
| identity    | `firstName` and `jobTitle` are non-empty (trimmed) |
| preferences | `tjmMin > 0` and `tjmMax >= tjmMin`                |
| skills      | at least one keyword                               |

## Effect protocol (machine → shell)

| When (transition)      | `pendingEffect` written        | Shell reports back             |
| ---------------------- | ------------------------------ | ------------------------------ |
| notifying → persisting | `PERSIST_PROFILE`              | `PERSISTED` / `PERSIST_FAILED` |
| persisting → scanning  | `START_SCAN`                   | `SCAN_DONE` / `SCAN_FAILED`    |
| *_SKIP → scanning      | `START_SCAN { partial: true }` | `SCAN_DONE` / `SCAN_FAILED`    |

On `PERSIST_FAILED`, the machine still writes `START_SCAN` and transitions to
`scanning` (never blocks first value); the typed error is surfaced in
`context.error` for the UI.

## Re-entry guard

`completed` / `skipped` are `final`. The extension gates on
`hasCompletedOnboarding` (storage flag set by the shell once `completed` is
reached), so the flow is never re-entered. The controller is created fresh each
onboarding run.

## Snapshot (projection)

`projectOnboardingFlow(ctx, phase)` exposes a stable `OnboardingFlowSnapshot`:
`phase`, `wizardStep`, `profile`, `connectedSources`, `notifyEnabled`,
`progress {current,total}`, `pendingEffect`, `error`, `terminal`, `canAdvance`.
The UI consumes only this shape; it never touches context directly.
