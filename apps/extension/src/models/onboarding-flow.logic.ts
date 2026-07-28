/**
 * Onboarding flow — pure guards & actions (XState v5 setup).
 *
 * No I/O, no async, no non-determinism. Each action returns a Partial context
 * patch; XState merges it into the frozen context. Side effects live only as
 * pure {@link OnboardingFlowEffect} descriptors emitted into `pendingEffect`.
 */
import { assign, setup } from 'xstate';

import type { UserProfile } from '$lib/core/types/profile';
import {
  ONBOARDING_WIZARD_STEPS,
  canAdvanceStep,
  type OnboardingFlowContext,
  type OnboardingFlowEffect,
  type OnboardingFlowEvent,
  type OnboardingFlowInput,
} from './onboarding-flow.contract';

/**
 * Pure XState setup. The concrete machine, the admission WeakSet, and the actor
 * remain private to the machine module (`onboarding-flow.machine.ts`). Only the
 * guard predicate is injected here so a single shared WeakSet can back both
 * `admitFlowEvent` (writer) and the `admittedEvent` guard (reader).
 */
export function createOnboardingFlowSetup(
  isAdmittedEvent: (event: OnboardingFlowEvent) => boolean
) {
  return setup({
    types: {
      context: {} as OnboardingFlowContext,
      events: {} as OnboardingFlowEvent,
      input: {} as OnboardingFlowInput,
    },
    guards: {
      admittedEvent: ({ event }) => isAdmittedEvent(event),
      canAdvanceWizardStep: ({ context }) => canAdvanceStep(context),
      hasConnectedSource: ({ context }) => context.connectedSources.length > 0,
      isFirstWizardStep: ({ context }) => context.wizardStep === 'identity',
      isLastWizardStep: ({ context }) => context.wizardStep === 'skills',
    },
    actions: {
      /** Entering the wizard from `connecting` resets to the first step. */
      initWizardStep: () => ({ wizardStep: 'identity', error: null }),
      toggleSource: assign(({ context, event }) => {
        if (event.type !== 'CONNECT_SOURCE' && event.type !== 'DISCONNECT_SOURCE') {
          return {};
        }
        const id = event.sourceId;
        const has = context.connectedSources.includes(id);
        const next =
          event.type === 'CONNECT_SOURCE'
            ? has
              ? context.connectedSources
              : [...context.connectedSources, id]
            : context.connectedSources.filter((s) => s !== id);
        return { connectedSources: Object.freeze(next) };
      }),
      markSession: assign(({ context, event }) => {
        if (event.type !== 'SOURCE_SESSION' || !event.hasSession) {
          return {};
        }
        if (context.connectedSources.includes(event.sourceId)) {
          return {};
        }
        return {
          connectedSources: Object.freeze([...context.connectedSources, event.sourceId]),
        };
      }),
      mergeProfile: assign(({ context, event }) => {
        if (event.type !== 'UPDATE_PROFILE') {
          return {};
        }
        return { profile: { ...context.profile, ...event.partial } };
      }),
      setNotify: assign(({ event }) => {
        if (event.type !== 'SET_NOTIFY') {
          return {};
        }
        return { notifyEnabled: event.enabled };
      }),
      goNextStep: assign(({ context }) => {
        const idx = ONBOARDING_WIZARD_STEPS.indexOf(context.wizardStep);
        const next = ONBOARDING_WIZARD_STEPS[idx + 1] ?? context.wizardStep;
        return { wizardStep: next };
      }),
      goBackStep: assign(({ context }) => {
        const idx = ONBOARDING_WIZARD_STEPS.indexOf(context.wizardStep);
        const prev = ONBOARDING_WIZARD_STEPS[idx - 1] ?? context.wizardStep;
        return { wizardStep: prev };
      }),
      requestPersist: assign(({ context }) => ({
        pendingEffect: {
          kind: 'PERSIST_PROFILE',
          attemptId: context.attemptId,
          profile: finalizeProfile(context),
          notifyEnabled: context.notifyEnabled,
        },
        error: null,
      })),
      requestScan: assign(({ context }) => ({
        pendingEffect: startScanEffect(context.attemptId, context.connectedSources.length === 0),
      })),
      skipToScan: assign(({ context }) => ({
        notifyEnabled: false,
        pendingEffect: startScanEffect(context.attemptId, true),
        error: null,
      })),
      failPersist: assign(({ context, event }) => {
        if (event.type !== 'PERSIST_FAILED') {
          return {};
        }
        // Never block first value: persist failure is recorded but we still scan.
        return {
          pendingEffect: startScanEffect(context.attemptId, context.connectedSources.length === 0),
          error: { type: 'persist_failed', message: event.message },
        };
      }),
      failScan: assign(({ event }) => {
        if (event.type !== 'SCAN_FAILED') {
          return {};
        }
        // Never block first value: scan failure still completes.
        return {
          pendingEffect: null,
          error: { type: 'scan_failed', message: event.message },
        };
      }),
      complete: () => ({ pendingEffect: null }),
    },
  });
}

function startScanEffect(attemptId: string, partial: boolean): OnboardingFlowEffect {
  return { kind: 'START_SCAN', attemptId, partial };
}

/**
 * Build the final {@link UserProfile} from the draft. Pure: fills sane defaults
 * for fields the wizard does not capture. The shell may further normalize via
 * `normalizeProfileDraft` / `withProfileDefaults` before persisting.
 */
function finalizeProfile(ctx: OnboardingFlowContext): UserProfile {
  const p = ctx.profile;
  return {
    firstName: p.firstName.trim() || 'Invité',
    jobTitle: p.jobTitle.trim() || 'Freelance',
    keywords: [...p.keywords],
    tjmMin: p.tjmMin,
    // Respect the user's explicit max. The `preferences` guard already enforces
    // tjmMax >= tjmMin; silently widening a valid narrow range (e.g. 800-850)
    // would discard the user's intent.
    tjmMax: p.tjmMax,
    location: p.location || '',
    remote: p.remote,
    seniority: 'senior',
    experiences: [],
    availability: null,
  };
}
