import { describe, expect, it } from 'vitest';

import {
  isReleaseEventPermitted,
  type LocalReleaseReadinessState,
  type ReleaseReadinessEvent,
} from '../../../scripts/release-readiness/reducer';

const STATES: readonly LocalReleaseReadinessState[] = [
  'audited',
  'blocked',
  'rc_built',
  'package_validated',
  'store_ready',
  'canary',
  'production',
  'rolled_back',
];

const PRIMARY_EVENTS: readonly ReleaseReadinessEvent['type'][] = [
  'BLOCKERS_INGESTED',
  'RC_SEAL_INGESTED',
  'RELEASE_PAYLOAD_VERIFIED_INGESTED',
  'PACKAGE_JOURNAL_INGESTED',
  'PACKAGE_VALIDATED_INGESTED',
  'STORE_READINESS_INGESTED',
  'SUBMISSION_RECEIPT_INGESTED',
  'CANARY_PASS_RECEIPT_INGESTED',
  'PRODUCTION_PROMOTION_RECEIPT_INGESTED',
  'ROLLBACK_RECEIPT_INGESTED',
  'LOCAL_EVIDENCE_INVALIDATED',
  'NEW_CANDIDATE_INGESTED',
];

const ALLOWED = new Set([
  'audited:BLOCKERS_INGESTED',
  'audited:RC_SEAL_INGESTED',
  'audited:LOCAL_EVIDENCE_INVALIDATED',
  'blocked:BLOCKERS_INGESTED',
  'blocked:PACKAGE_JOURNAL_INGESTED',
  'blocked:PACKAGE_VALIDATED_INGESTED',
  'blocked:LOCAL_EVIDENCE_INVALIDATED',
  'blocked:NEW_CANDIDATE_INGESTED',
  'rc_built:BLOCKERS_INGESTED',
  'rc_built:RELEASE_PAYLOAD_VERIFIED_INGESTED',
  'rc_built:PACKAGE_JOURNAL_INGESTED',
  'rc_built:PACKAGE_VALIDATED_INGESTED',
  'rc_built:LOCAL_EVIDENCE_INVALIDATED',
  'package_validated:BLOCKERS_INGESTED',
  'package_validated:STORE_READINESS_INGESTED',
  'package_validated:LOCAL_EVIDENCE_INVALIDATED',
  'store_ready:BLOCKERS_INGESTED',
  'store_ready:SUBMISSION_RECEIPT_INGESTED',
  'store_ready:CANARY_PASS_RECEIPT_INGESTED',
  'store_ready:LOCAL_EVIDENCE_INVALIDATED',
  'canary:BLOCKERS_INGESTED',
  'canary:PRODUCTION_PROMOTION_RECEIPT_INGESTED',
  'canary:ROLLBACK_RECEIPT_INGESTED',
  'canary:LOCAL_EVIDENCE_INVALIDATED',
  'production:BLOCKERS_INGESTED',
  'production:ROLLBACK_RECEIPT_INGESTED',
  'production:LOCAL_EVIDENCE_INVALIDATED',
]);

describe('release readiness eight-state matrix', () => {
  it('matches every primary state/event cell in the approved model', () => {
    expect(STATES).toHaveLength(8);
    expect(PRIMARY_EVENTS).toHaveLength(12);
    for (const state of STATES) {
      for (const eventType of PRIMARY_EVENTS) {
        expect(isReleaseEventPermitted(state, eventType), `${state}:${eventType}`).toBe(
          ALLOWED.has(`${state}:${eventType}`)
        );
      }
    }
  });

  it('permits the restart/observation protocol in every state', () => {
    for (const state of STATES) {
      expect(isReleaseEventPermitted(state, 'SERVICE_RESTARTED')).toBe(true);
      expect(isReleaseEventPermitted(state, 'LOCAL_RELEASE_OBSERVATION_INGESTED')).toBe(true);
    }
  });
});
