/**
 * Onboarding flow — XState v5 machine + public controller facade.
 *
 * The machine is pure: it emits {@link OnboardingFlowEffect} descriptors but
 * never executes them. The shell (OnboardingPage) owns all I/O: it subscribes,
 * consumes `pendingEffect`, runs persist/scan, and reports back via events.
 *
 * Re-use: source-level consent (durable `enabledConnectors` + permissions) is
 * owned by `onboarding-source.machine.ts`. This flow machine only orchestrates
 * the UI phases and treats "connected source" as an in-memory UI fact.
 */
import { and, createActor, type Subscription } from 'xstate';

import {
  initialOnboardingFlowContext,
  parseOnboardingFlowInput,
  phaseFromStateValue,
  projectOnboardingFlow,
  type OnboardingFlowEvent,
  type OnboardingFlowInput,
  type OnboardingFlowSnapshot,
} from './onboarding-flow.contract';
import { createOnboardingFlowSetup } from './onboarding-flow.logic';

export * from './onboarding-flow.contract';

/**
 * Single source of truth for event admission. The controller writes here via
 * {@link admitFlowEvent} before dispatching; the `admittedEvent` guard reads
 * here via the closure passed to {@link createOnboardingFlowSetup}. Both the
 * writer and reader MUST reference the SAME set — a second set (e.g. one living
 * inside logic.ts) would silently reject every event.
 */
const ACTIVE_FLOW_EVENTS = new WeakSet<object>();

/** Mark an event as admitted (originated from the controller, not injected). */
function admitFlowEvent(event: OnboardingFlowEvent): void {
  ACTIVE_FLOW_EVENTS.add(event);
}

const onboardingFlowSetup = createOnboardingFlowSetup((event) => ACTIVE_FLOW_EVENTS.has(event));

const onboardingFlowMachine = onboardingFlowSetup.createMachine({
  id: 'onboardingFlow',
  context: ({ input }) => initialOnboardingFlowContext(input),
  initial: 'welcome',
  states: {
    welcome: {
      on: {
        START: { guard: and(['admittedEvent']), target: 'connecting' },
        SKIP: { guard: and(['admittedEvent']), target: 'scanning', actions: 'skipToScan' },
      },
    },
    connecting: {
      on: {
        CONNECT_SOURCE: { guard: and(['admittedEvent']), actions: 'toggleSource' },
        DISCONNECT_SOURCE: { guard: and(['admittedEvent']), actions: 'toggleSource' },
        SOURCE_SESSION: { guard: and(['admittedEvent']), actions: 'markSession' },
        NEXT: {
          guard: and(['admittedEvent', 'hasConnectedSource']),
          target: 'wizard',
          actions: 'initWizardStep',
        },
        BACK: { guard: and(['admittedEvent']), target: 'welcome' },
        SKIP: { guard: and(['admittedEvent']), target: 'scanning', actions: 'skipToScan' },
      },
    },
    wizard: {
      // Flat state: `context.wizardStep` (identity|preferences|skills) is the
      // single source of truth for the current step. NEXT/BACK without a target
      // are internal transitions that only mutate context. Phase is derived from
      // the active state value, so it can never desync from `wizardStep`.
      on: {
        UPDATE_PROFILE: { guard: and(['admittedEvent']), actions: 'mergeProfile' },
        NEXT: [
          {
            guard: and(['admittedEvent', 'canAdvanceWizardStep', 'isLastWizardStep']),
            target: 'notifying',
          },
          {
            guard: and(['admittedEvent', 'canAdvanceWizardStep']),
            actions: 'goNextStep',
          },
        ],
        BACK: [
          {
            guard: and(['admittedEvent', 'isFirstWizardStep']),
            target: 'connecting',
          },
          { guard: and(['admittedEvent']), actions: 'goBackStep' },
        ],
        SKIP: { guard: and(['admittedEvent']), target: 'scanning', actions: 'skipToScan' },
      },
    },
    notifying: {
      on: {
        SET_NOTIFY: { guard: and(['admittedEvent']), actions: 'setNotify' },
        NEXT: { guard: and(['admittedEvent']), target: 'persisting', actions: 'requestPersist' },
        // Back to wizard preserves wizardStep (no decrement): the user returns
        // to the last step they were on.
        BACK: { guard: and(['admittedEvent']), target: 'wizard' },
        SKIP: { guard: and(['admittedEvent']), target: 'scanning', actions: 'skipToScan' },
      },
    },
    persisting: {
      on: {
        PERSISTED: { guard: and(['admittedEvent']), target: 'scanning', actions: 'requestScan' },
        PERSIST_FAILED: {
          guard: and(['admittedEvent']),
          target: 'scanning',
          actions: 'failPersist',
        },
      },
    },
    scanning: {
      on: {
        SCAN_DONE: { guard: and(['admittedEvent']), target: 'completed', actions: 'complete' },
        SCAN_FAILED: { guard: and(['admittedEvent']), target: 'completed', actions: 'failScan' },
      },
    },
    completed: { type: 'final' },
  },
});

export interface OnboardingFlowController {
  start(): void;
  stop(): void;
  send(event: OnboardingFlowEvent): void;
  getSnapshot(): OnboardingFlowSnapshot;
  subscribe(listener: (snapshot: OnboardingFlowSnapshot) => void): Subscription;
}

export function createOnboardingFlowController(
  input: OnboardingFlowInput
): OnboardingFlowController {
  const parsed = parseOnboardingFlowInput(input);
  const actor = createActor(onboardingFlowMachine, { input: parsed });

  const toSnapshot = (state: ReturnType<typeof actor.getSnapshot>): OnboardingFlowSnapshot => {
    const value =
      typeof state.value === 'string' ? state.value : (Object.keys(state.value)[0] ?? 'welcome');
    return projectOnboardingFlow(state.context, phaseFromStateValue(value));
  };

  return {
    start() {
      actor.start();
    },
    stop() {
      actor.stop();
    },
    send(event: OnboardingFlowEvent) {
      admitFlowEvent(event);
      actor.send(event);
    },
    getSnapshot() {
      return toSnapshot(actor.getSnapshot());
    },
    subscribe(listener) {
      return actor.subscribe((s) => listener(toSnapshot(s)));
    },
  };
}

export { onboardingFlowMachine };
