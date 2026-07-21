import { assign, setup, type SnapshotFrom } from 'xstate';

export const PREMIUM_ENTITLEMENT_STATES = [
  'unlinked',
  'linking',
  'checking',
  'free',
  'active',
  'expired',
  'revoked',
  'error',
] as const;

export type PremiumEntitlementStateValue = (typeof PREMIUM_ENTITLEMENT_STATES)[number];

export interface PremiumEntitlementSnapshot {
  subject: string;
  issuedAtMs: number;
  expiresAtMs: number;
}

export interface PremiumEntitlementError {
  code: 'LINK_FAILED' | 'SYNC_FAILED' | 'MALFORMED_RESPONSE' | 'SESSION_REJECTED';
  message: string;
  retryable: boolean;
}

export interface PremiumEntitlementContext {
  activeRequestId: string | null;
  linkedSubject: string | null;
  hasSessionBearer: boolean;
  snapshot: PremiumEntitlementSnapshot | null;
  lastError: PremiumEntitlementError | null;
}

export type PremiumEntitlementEvent =
  | { type: 'LINK_REQUESTED'; requestId: string }
  | { type: 'LINK_SUCCEEDED'; requestId: string; subject: string }
  | { type: 'LINK_CANCELLED'; requestId: string }
  | { type: 'LINK_FAILED'; requestId: string; error: PremiumEntitlementError }
  | { type: 'SYNC_REQUESTED'; requestId: string; sessionBearerAvailable?: boolean }
  | { type: 'ENTITLEMENT_FREE'; requestId: string; subject: string }
  | {
      type: 'ENTITLEMENT_ACTIVE';
      requestId: string;
      snapshot: PremiumEntitlementSnapshot;
      observedAtMs: number;
    }
  | { type: 'ENTITLEMENT_EXPIRED'; requestId: string; subject: string }
  | { type: 'ENTITLEMENT_REVOKED'; requestId: string; subject: string }
  | { type: 'SESSION_REJECTED'; requestId: string; error: PremiumEntitlementError }
  | { type: 'SYNC_FAILED'; requestId: string; error: PremiumEntitlementError }
  | { type: 'LOCAL_EXPIRY_OBSERVED'; observedAtMs: number }
  | { type: 'UNLINK_REQUESTED' };

const EMPTY_CONTEXT: PremiumEntitlementContext = {
  activeRequestId: null,
  linkedSubject: null,
  hasSessionBearer: false,
  snapshot: null,
  lastError: null,
};

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function isUsablePremiumEntitlementSnapshot(
  snapshot: PremiumEntitlementSnapshot | null,
  observedAtMs: number
): snapshot is PremiumEntitlementSnapshot {
  return (
    snapshot !== null &&
    nonEmpty(snapshot.subject) &&
    Number.isFinite(snapshot.issuedAtMs) &&
    Number.isFinite(snapshot.expiresAtMs) &&
    snapshot.issuedAtMs <= observedAtMs &&
    snapshot.expiresAtMs > observedAtMs &&
    snapshot.expiresAtMs > snapshot.issuedAtMs
  );
}

export function premiumEntitlementPermitsCopilot(
  state: PremiumEntitlementStateValue,
  context: PremiumEntitlementContext,
  observedAtMs: number
): boolean {
  return (
    state === 'active' &&
    context.hasSessionBearer &&
    isUsablePremiumEntitlementSnapshot(context.snapshot, observedAtMs)
  );
}

function requestMatches(context: PremiumEntitlementContext, event: { requestId: string }): boolean {
  return nonEmpty(event.requestId) && event.requestId === context.activeRequestId;
}

const premiumEntitlementSetup = setup({
  types: {
    context: {} as PremiumEntitlementContext,
    events: {} as PremiumEntitlementEvent,
  },
  guards: {
    validLinkRequest: ({ event }) => event.type === 'LINK_REQUESTED' && nonEmpty(event.requestId),
    matchingLinkSuccess: ({ context, event }) =>
      event.type === 'LINK_SUCCEEDED' && requestMatches(context, event) && nonEmpty(event.subject),
    matchingLinkCancellation: ({ context, event }) =>
      event.type === 'LINK_CANCELLED' && requestMatches(context, event),
    matchingLinkFailure: ({ context, event }) =>
      event.type === 'LINK_FAILED' && requestMatches(context, event),
    validSyncRequest: ({ context, event }) =>
      event.type === 'SYNC_REQUESTED' &&
      nonEmpty(event.requestId) &&
      (context.hasSessionBearer || event.sessionBearerAvailable === true) &&
      context.linkedSubject !== null,
    matchingFree: ({ context, event }) =>
      event.type === 'ENTITLEMENT_FREE' &&
      requestMatches(context, event) &&
      event.subject === context.linkedSubject,
    matchingActive: ({ context, event }) =>
      event.type === 'ENTITLEMENT_ACTIVE' &&
      requestMatches(context, event) &&
      event.snapshot.subject === context.linkedSubject &&
      isUsablePremiumEntitlementSnapshot(event.snapshot, event.observedAtMs),
    matchingExpired: ({ context, event }) =>
      event.type === 'ENTITLEMENT_EXPIRED' &&
      requestMatches(context, event) &&
      event.subject === context.linkedSubject,
    matchingRevoked: ({ context, event }) =>
      event.type === 'ENTITLEMENT_REVOKED' &&
      requestMatches(context, event) &&
      event.subject === context.linkedSubject,
    matchingSessionRejection: ({ context, event }) =>
      event.type === 'SESSION_REJECTED' && requestMatches(context, event),
    matchingSyncFailure: ({ context, event }) =>
      event.type === 'SYNC_FAILED' && requestMatches(context, event),
    locallyExpired: ({ context, event }) =>
      event.type === 'LOCAL_EXPIRY_OBSERVED' &&
      context.snapshot !== null &&
      event.observedAtMs >= context.snapshot.expiresAtMs,
  },
  actions: {
    beginLink: assign(({ event }) => {
      if (event.type !== 'LINK_REQUESTED') return {};
      return {
        ...EMPTY_CONTEXT,
        activeRequestId: event.requestId,
      };
    }),
    acceptLink: assign(({ event }) => {
      if (event.type !== 'LINK_SUCCEEDED') return {};
      return {
        linkedSubject: event.subject,
        hasSessionBearer: true,
        lastError: null,
      };
    }),
    beginSync: assign(({ context, event }) => {
      if (event.type !== 'SYNC_REQUESTED') return {};
      return {
        activeRequestId: event.requestId,
        hasSessionBearer: context.hasSessionBearer || event.sessionBearerAvailable === true,
        lastError: null,
      };
    }),
    acceptActive: assign(({ event }) => {
      if (event.type !== 'ENTITLEMENT_ACTIVE') return {};
      return {
        activeRequestId: null,
        snapshot: event.snapshot,
        lastError: null,
      };
    }),
    acceptNonActive: assign(({ event }) => {
      if (
        event.type !== 'ENTITLEMENT_FREE' &&
        event.type !== 'ENTITLEMENT_EXPIRED' &&
        event.type !== 'ENTITLEMENT_REVOKED'
      ) {
        return {};
      }

      return {
        activeRequestId: null,
        linkedSubject: event.subject,
        snapshot: null,
        // Entitlement is authority; the short-lived bearer is only identity.
        // Keep it for owner-scoped inspect/cancel/review/delete recovery until
        // the server explicitly rejects the session or the user unlinks.
        hasSessionBearer: true,
        lastError: null,
      };
    }),
    recordLinkFailure: assign(({ event }) => {
      if (event.type !== 'LINK_FAILED') return {};
      return {
        ...EMPTY_CONTEXT,
        lastError: event.error,
      };
    }),
    recordSyncFailure: assign(({ event }) => {
      if (event.type !== 'SYNC_FAILED') return {};
      return {
        activeRequestId: null,
        snapshot: null,
        lastError: event.error,
      };
    }),
    clearLink: assign(() => ({ ...EMPTY_CONTEXT })),
    clearRejectedSession: assign(({ event }) => ({
      ...EMPTY_CONTEXT,
      lastError: event.type === 'SESSION_REJECTED' ? event.error : null,
    })),
    expireLocally: assign(() => ({
      activeRequestId: null,
      snapshot: null,
      lastError: null,
    })),
  },
});

const SYNCABLE_STATE = {
  on: {
    SYNC_REQUESTED: {
      target: 'checking',
      guard: 'validSyncRequest',
      actions: 'beginSync',
    },
    UNLINK_REQUESTED: {
      target: 'unlinked',
      actions: 'clearLink',
    },
  },
} as const;

export const premiumEntitlementMachine = premiumEntitlementSetup.createMachine({
  id: 'premium-entitlement-sync',
  initial: 'unlinked',
  context: { ...EMPTY_CONTEXT },
  states: {
    unlinked: {
      on: {
        LINK_REQUESTED: {
          target: 'linking',
          guard: 'validLinkRequest',
          actions: 'beginLink',
        },
      },
    },
    linking: {
      on: {
        LINK_SUCCEEDED: {
          target: 'checking',
          guard: 'matchingLinkSuccess',
          actions: 'acceptLink',
        },
        LINK_CANCELLED: {
          target: 'unlinked',
          guard: 'matchingLinkCancellation',
          actions: 'clearLink',
        },
        LINK_FAILED: {
          target: 'error',
          guard: 'matchingLinkFailure',
          actions: 'recordLinkFailure',
        },
      },
    },
    checking: {
      on: {
        ENTITLEMENT_FREE: {
          target: 'free',
          guard: 'matchingFree',
          actions: 'acceptNonActive',
        },
        ENTITLEMENT_ACTIVE: {
          target: 'active',
          guard: 'matchingActive',
          actions: 'acceptActive',
        },
        ENTITLEMENT_EXPIRED: {
          target: 'expired',
          guard: 'matchingExpired',
          actions: 'acceptNonActive',
        },
        ENTITLEMENT_REVOKED: {
          target: 'revoked',
          guard: 'matchingRevoked',
          actions: 'acceptNonActive',
        },
        SESSION_REJECTED: {
          target: 'unlinked',
          guard: 'matchingSessionRejection',
          actions: 'clearRejectedSession',
        },
        SYNC_FAILED: {
          target: 'error',
          guard: 'matchingSyncFailure',
          actions: 'recordSyncFailure',
        },
      },
    },
    free: SYNCABLE_STATE,
    active: {
      ...SYNCABLE_STATE,
      on: {
        ...SYNCABLE_STATE.on,
        LOCAL_EXPIRY_OBSERVED: {
          target: 'expired',
          guard: 'locallyExpired',
          actions: 'expireLocally',
        },
      },
    },
    expired: SYNCABLE_STATE,
    revoked: SYNCABLE_STATE,
    error: SYNCABLE_STATE,
  },
});

export type PremiumEntitlementSnapshotState = SnapshotFrom<typeof premiumEntitlementMachine>;
