/**
 * Onboarding flow — contract (pure, no I/O).
 *
 * Models the end-to-end onboarding UI flow as an explicit state machine:
 *   welcome → connecting → wizard(identity → preferences → skills) →
 *   notifying → persisting → scanning → completed | skipped
 *
 * Invariant (binding): the first scan is NEVER blocked. A persist failure or a
 * scan failure still advances to `completed` (with a typed error surfaced). The
 * only way to not reach the feed is an explicit terminal `skipped` that still
 * ran a default partial scan.
 *
 * Discipline (binding):
 * - This file is pure: no fetch, no chrome.*, no async, no Date.now/UUID. The
 *   only non-deterministic value (`attemptId`) is injected via {@link OnboardingFlowInput}.
 * - The machine NEVER performs a side effect. It emits a pure {@link OnboardingFlowEffect}
 *   descriptor in context; the shell (OnboardingPage) consumes it and reports
 *   back via events (SCAN_DONE / SCAN_FAILED / PERSISTED). The model decides
 *   transitions; the shell executes effects. "The LLM produces signals; the
 *   model decides."
 * - Every transition is guarded. There are no implicit/free-text transitions.
 *
 * See `onboarding-flow.model.md` for the authoritative prose model.
 */

import type { UserProfile } from '$lib/core/types/profile';

export const ONBOARDING_FLOW_MODEL_VERSION = 1;

/** Wizard step, in strict order. */
export const ONBOARDING_WIZARD_STEPS = ['identity', 'preferences', 'skills'] as const;
export type OnboardingWizardStep = (typeof ONBOARDING_WIZARD_STEPS)[number];

/** Top-level phase the UI renders. */
export type OnboardingFlowPhase =
  | 'welcome'
  | 'connecting'
  | 'wizard'
  | 'notifying'
  | 'persisting'
  | 'scanning'
  | 'completed'
  | 'skipped';

/** Draft profile built during the wizard. Partial until completion. */
export type OnboardingProfileDraft = Pick<
  UserProfile,
  'firstName' | 'jobTitle' | 'location' | 'remote' | 'keywords' | 'tjmMin' | 'tjmMax'
>;

export interface OnboardingFlowContext {
  readonly attemptId: string;
  /**
   * Current wizard step. Source of truth for the wizard UI; the top-level
   * phase is derived from the actor's state value (see {@link projectOnboardingFlow}).
   */
  readonly wizardStep: OnboardingWizardStep;
  readonly profile: OnboardingProfileDraft;
  /** Source ids the user marked as connected during `connecting`. */
  readonly connectedSources: readonly string[];
  readonly notifyEnabled: boolean;
  /**
   * Pure effect descriptor the shell must run. Cleared back to `null` once the
   * shell acknowledges it (via SCAN_DONE / SCAN_FAILED / PERSISTED). The machine
   * never executes it.
   */
  readonly pendingEffect: OnboardingFlowEffect | null;
  /** Human-readable, typed error surfaced to the UI (never thrown). */
  readonly error: OnboardingFlowError | null;
}

/** Pure side-effect descriptor. The shell is the only executor. */
export type OnboardingFlowEffect =
  | { readonly kind: 'START_SCAN'; readonly attemptId: string; readonly partial: boolean }
  | {
      readonly kind: 'PERSIST_PROFILE';
      readonly attemptId: string;
      readonly profile: UserProfile;
      readonly notifyEnabled: boolean;
    };

export type OnboardingFlowError =
  | { readonly type: 'scan_failed'; readonly message: string }
  | { readonly type: 'persist_failed'; readonly message: string };

/** Events the shell may dispatch. Unknown events are ignored by the machine. */
export type OnboardingFlowEvent =
  | { type: 'START' }
  | { type: 'CONNECT_SOURCE'; sourceId: string }
  | { type: 'DISCONNECT_SOURCE'; sourceId: string }
  | { type: 'SOURCE_SESSION'; sourceId: string; hasSession: boolean }
  | { type: 'UPDATE_PROFILE'; partial: Partial<OnboardingProfileDraft> }
  | { type: 'SET_NOTIFY'; enabled: boolean }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SKIP' }
  | { type: 'SCAN_DONE' }
  | { type: 'SCAN_FAILED'; message: string }
  | { type: 'PERSISTED' }
  | { type: 'PERSIST_FAILED'; message: string };

export interface OnboardingFlowInput {
  readonly attemptId: string;
  /** Catalog of selectable sources (already filtered to included connectors). */
  readonly sources: readonly { readonly id: string }[];
  /** Optional re-hydration seed (e.g. a profile loaded from storage). */
  readonly initialProfile?: Partial<OnboardingProfileDraft>;
}

/** Projection consumed by the UI. Stable shape; hides internal context. */
export interface OnboardingFlowSnapshot {
  readonly phase: OnboardingFlowPhase;
  readonly wizardStep: OnboardingWizardStep;
  readonly profile: OnboardingProfileDraft;
  readonly connectedSources: readonly string[];
  readonly notifyEnabled: boolean;
  readonly progress: { readonly current: number; readonly total: number };
  readonly pendingEffect: OnboardingFlowEffect | null;
  readonly error: OnboardingFlowError | null;
  readonly terminal: boolean;
  /** True when the current wizard step's guard is satisfied (decides NEXT). */
  readonly canAdvance: boolean;
}

/** Normalize + validate input. Throws on invalid (deterministic guard). */
export function parseOnboardingFlowInput(input: OnboardingFlowInput): OnboardingFlowInput {
  if (!input || typeof input !== 'object') {
    throw new Error('onboarding-flow: input required');
  }
  if (!input.attemptId || typeof input.attemptId !== 'string') {
    throw new Error('onboarding-flow: attemptId required');
  }
  if (!Array.isArray(input.sources)) {
    throw new Error('onboarding-flow: sources catalog required');
  }
  if (input.sources.length === 0) {
    throw new Error('onboarding-flow: sources catalog must not be empty');
  }
  const seen = new Set<string>();
  for (const s of input.sources) {
    if (!s || typeof s.id !== 'string' || s.id.length === 0) {
      throw new Error('onboarding-flow: invalid source entry');
    }
    if (seen.has(s.id)) {
      throw new Error(`onboarding-flow: duplicate source id "${s.id}"`);
    }
    seen.add(s.id);
  }
  return input;
}

export function initialOnboardingFlowContext(input: OnboardingFlowInput): OnboardingFlowContext {
  const seed = input.initialProfile ?? {};
  return {
    attemptId: input.attemptId,
    wizardStep: 'identity',
    profile: {
      firstName: seed.firstName ?? '',
      jobTitle: seed.jobTitle ?? '',
      location: seed.location ?? '',
      remote: seed.remote ?? 'any',
      keywords: seed.keywords ?? [],
      tjmMin: seed.tjmMin ?? 500,
      tjmMax: seed.tjmMax ?? 800,
    },
    connectedSources: [],
    notifyEnabled: false,
    pendingEffect: null,
    error: null,
  };
}

/**
 * Derive the UI phase from the actor's state value. State names mirror phases
 * 1:1 (wizard is a flat state whose current step lives in `context.wizardStep`),
 * so phase === the active state value. This removes any possibility of
 * `context.phase` desynchronising from the actual machine state.
 */
export function phaseFromStateValue(value: string | undefined): OnboardingFlowPhase {
  const known: OnboardingFlowPhase[] = [
    'welcome',
    'connecting',
    'wizard',
    'notifying',
    'persisting',
    'scanning',
    'completed',
    'skipped',
  ];
  return value && (known as readonly string[]).includes(value)
    ? (value as OnboardingFlowPhase)
    : 'welcome';
}

export function projectOnboardingFlow(
  ctx: OnboardingFlowContext,
  phase: OnboardingFlowPhase
): OnboardingFlowSnapshot {
  const order: OnboardingFlowPhase[] = [
    'welcome',
    'connecting',
    'wizard',
    'notifying',
    'persisting',
    'scanning',
    'completed',
  ];
  const current = order.indexOf(phase) + 1;
  return {
    phase,
    wizardStep: ctx.wizardStep,
    profile: ctx.profile,
    connectedSources: ctx.connectedSources,
    notifyEnabled: ctx.notifyEnabled,
    progress: { current: current < 0 ? 0 : current, total: order.length },
    pendingEffect: ctx.pendingEffect,
    error: ctx.error,
    terminal: phase === 'completed' || phase === 'skipped',
    canAdvance: canAdvanceStep(ctx),
  };
}

/** Pure guard: can the user leave the current wizard step via NEXT? */
export function canAdvanceStep(ctx: OnboardingFlowContext): boolean {
  switch (ctx.wizardStep) {
    case 'identity':
      return ctx.profile.firstName.trim().length > 0 && ctx.profile.jobTitle.trim().length > 0;
    case 'preferences':
      return ctx.profile.tjmMin > 0 && ctx.profile.tjmMax >= ctx.profile.tjmMin;
    case 'skills':
      return ctx.profile.keywords.length > 0;
    default:
      return false;
  }
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value as Readonly<T>;
}
