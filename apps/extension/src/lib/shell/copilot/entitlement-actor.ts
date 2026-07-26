import {
  premiumEntitlementMachine,
  premiumEntitlementPermitsCopilot,
  type PremiumEntitlementError,
  type PremiumEntitlementStateValue,
} from '@pulse/domain';
import { createActor } from 'xstate';

import type { CopilotEntitlement, CopilotSessionCredential } from './contracts';

export interface CopilotEntitlementProjection {
  state: PremiumEntitlementStateValue;
  linkedSubject: string | null;
  hasSessionBearer: boolean;
  permitsCreation: boolean;
}

export interface CopilotEntitlementActor {
  beginLink(requestId: string): boolean;
  linkSucceeded(requestId: string, subject: string): boolean;
  linkCancelled(requestId: string): void;
  linkFailed(requestId: string, message: string, retryable: boolean): void;
  prepareSync(requestId: string, session: CopilotSessionCredential): string | null;
  applyEntitlement(
    correlationId: string,
    entitlement: CopilotEntitlement,
    observedAtMs: number
  ): boolean;
  syncFailed(correlationId: string, message: string, retryable: boolean): void;
  sessionRejected(requestId: string, session: CopilotSessionCredential): void;
  observeLocalExpiry(observedAtMs: number): void;
  project(observedAtMs: number): CopilotEntitlementProjection;
}

function entitlementError(
  code: PremiumEntitlementError['code'],
  message: string,
  retryable: boolean
): PremiumEntitlementError {
  return { code, message, retryable };
}

export function createCopilotEntitlementActor(): CopilotEntitlementActor {
  let actor = createActor(premiumEntitlementMachine);
  actor.start();

  function state(): PremiumEntitlementStateValue {
    return actor.getSnapshot().value as PremiumEntitlementStateValue;
  }

  function reset(): void {
    actor.stop();
    actor = createActor(premiumEntitlementMachine);
    actor.start();
  }

  function bootstrapSession(requestId: string, session: CopilotSessionCredential): string | null {
    actor.send({ type: 'LINK_REQUESTED', requestId });
    actor.send({ type: 'LINK_SUCCEEDED', requestId, subject: session.subject });
    const snapshot = actor.getSnapshot();
    return snapshot.value === 'checking' && snapshot.context.activeRequestId === requestId
      ? requestId
      : null;
  }

  return {
    beginLink(requestId) {
      const current = state();
      if (current !== 'unlinked') {
        if (current === 'checking' || current === 'linking') {
          reset();
        } else {
          actor.send({ type: 'UNLINK_REQUESTED' });
        }
      }
      actor.send({ type: 'LINK_REQUESTED', requestId });
      return (
        actor.getSnapshot().value === 'linking' &&
        actor.getSnapshot().context.activeRequestId === requestId
      );
    },

    linkSucceeded(requestId, subject) {
      actor.send({ type: 'LINK_SUCCEEDED', requestId, subject });
      const snapshot = actor.getSnapshot();
      return snapshot.value === 'checking' && snapshot.context.linkedSubject === subject;
    },

    linkCancelled(requestId) {
      actor.send({ type: 'LINK_CANCELLED', requestId });
    },

    linkFailed(requestId, message, retryable) {
      actor.send({
        type: 'LINK_FAILED',
        requestId,
        error: entitlementError('LINK_FAILED', message, retryable),
      });
    },

    prepareSync(requestId, session) {
      const snapshot = actor.getSnapshot();
      if (
        snapshot.value === 'checking' &&
        snapshot.context.linkedSubject === session.subject &&
        snapshot.context.hasSessionBearer
      ) {
        return snapshot.context.activeRequestId;
      }
      if (
        snapshot.context.linkedSubject !== session.subject ||
        !snapshot.context.hasSessionBearer ||
        snapshot.value === 'unlinked' ||
        snapshot.value === 'linking'
      ) {
        reset();
        return bootstrapSession(requestId, session);
      }
      actor.send({ type: 'SYNC_REQUESTED', requestId, sessionBearerAvailable: true });
      const checking = actor.getSnapshot();
      return checking.value === 'checking' && checking.context.activeRequestId === requestId
        ? requestId
        : null;
    },

    applyEntitlement(correlationId, entitlement, observedAtMs) {
      if (
        entitlement.status === 'active' &&
        entitlement.issuedAtMs !== null &&
        entitlement.expiresAtMs !== null
      ) {
        actor.send({
          type: 'ENTITLEMENT_ACTIVE',
          requestId: correlationId,
          snapshot: {
            subject: entitlement.subject,
            issuedAtMs: entitlement.issuedAtMs,
            expiresAtMs: entitlement.expiresAtMs,
          },
          observedAtMs,
        });
      } else if (entitlement.status === 'free') {
        actor.send({
          type: 'ENTITLEMENT_FREE',
          requestId: correlationId,
          subject: entitlement.subject,
        });
      } else if (entitlement.status === 'expired') {
        actor.send({
          type: 'ENTITLEMENT_EXPIRED',
          requestId: correlationId,
          subject: entitlement.subject,
        });
      } else if (entitlement.status === 'revoked') {
        actor.send({
          type: 'ENTITLEMENT_REVOKED',
          requestId: correlationId,
          subject: entitlement.subject,
        });
      } else {
        actor.send({
          type: 'SYNC_FAILED',
          requestId: correlationId,
          error: entitlementError('MALFORMED_RESPONSE', 'Entitlement actif incomplet.', false),
        });
      }
      const snapshot = actor.getSnapshot();
      return (
        snapshot.context.activeRequestId === null &&
        snapshot.value === entitlement.status &&
        snapshot.context.linkedSubject === entitlement.subject
      );
    },

    syncFailed(correlationId, message, retryable) {
      actor.send({
        type: 'SYNC_FAILED',
        requestId: correlationId,
        error: entitlementError('SYNC_FAILED', message, retryable),
      });
    },

    sessionRejected(requestId, session) {
      const correlationId = this.prepareSync(requestId, session);
      if (!correlationId) {
        return;
      }
      actor.send({
        type: 'SESSION_REJECTED',
        requestId: correlationId,
        error: entitlementError('SESSION_REJECTED', 'Session Copilot rejetée.', false),
      });
    },

    observeLocalExpiry(observedAtMs) {
      actor.send({ type: 'LOCAL_EXPIRY_OBSERVED', observedAtMs });
    },

    project(observedAtMs) {
      this.observeLocalExpiry(observedAtMs);
      const snapshot = actor.getSnapshot();
      const value = snapshot.value as PremiumEntitlementStateValue;
      return {
        state: value,
        linkedSubject: snapshot.context.linkedSubject,
        hasSessionBearer: snapshot.context.hasSessionBearer,
        permitsCreation: premiumEntitlementPermitsCopilot(value, snapshot.context, observedAtMs),
      };
    },
  };
}
