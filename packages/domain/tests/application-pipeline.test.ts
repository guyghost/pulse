import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STAGES,
  canonicalizeLegacyApplicationStage,
  isAllowedApplicationTransition,
  transitionApplicationStage,
} from '../src';

describe('application pipeline', () => {
  it('defines the canonical MissionPulse application stages in order', () => {
    expect(APPLICATION_STAGES).toEqual([
      'detected',
      'selected',
      'application_prepared',
      'applied',
      'interview',
      'offer',
      'accepted',
      'rejected',
      'archived',
    ]);
  });

  it('accepts canonical forward transitions and archive reactivation', () => {
    expect(isAllowedApplicationTransition('detected', 'selected')).toBe(true);
    expect(isAllowedApplicationTransition('selected', 'application_prepared')).toBe(true);
    expect(isAllowedApplicationTransition('application_prepared', 'applied')).toBe(true);
    expect(isAllowedApplicationTransition('applied', 'interview')).toBe(true);
    expect(isAllowedApplicationTransition('interview', 'offer')).toBe(true);
    expect(isAllowedApplicationTransition('offer', 'accepted')).toBe(true);
    expect(isAllowedApplicationTransition('rejected', 'archived')).toBe(true);
    expect(isAllowedApplicationTransition('archived', 'detected')).toBe(true);
  });

  it('rejects skipped or terminal transitions that would corrupt pipeline history', () => {
    expect(isAllowedApplicationTransition('detected', 'applied')).toBe(false);
    expect(isAllowedApplicationTransition('selected', 'offer')).toBe(false);
    expect(isAllowedApplicationTransition('accepted', 'applied')).toBe(false);
    expect(isAllowedApplicationTransition('rejected', 'offer')).toBe(false);
  });

  it('creates a serializable pipeline event for valid transitions', () => {
    expect(
      transitionApplicationStage({
        applicationId: 'app-123',
        fromStage: 'selected',
        toStage: 'application_prepared',
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
        createdBy: 'extension',
        clientEventId: 'evt-123',
        note: 'Message generated',
      })
    ).toEqual({
      applicationId: 'app-123',
      fromStage: 'selected',
      toStage: 'application_prepared',
      occurredAt: '2026-05-22T08:00:00.000Z',
      createdBy: 'extension',
      clientEventId: 'evt-123',
      note: 'Message generated',
    });
  });

  it('creates the initial detected pipeline event with a null source stage', () => {
    expect(
      transitionApplicationStage({
        applicationId: 'app-123',
        fromStage: null,
        toStage: 'detected',
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
        createdBy: 'extension',
        clientEventId: 'evt-initial',
      })
    ).toEqual({
      applicationId: 'app-123',
      fromStage: null,
      toStage: 'detected',
      occurredAt: '2026-05-22T08:00:00.000Z',
      createdBy: 'extension',
      clientEventId: 'evt-initial',
      note: null,
    });
  });

  it('returns null instead of emitting invalid transition events', () => {
    expect(
      transitionApplicationStage({
        applicationId: 'app-123',
        fromStage: 'detected',
        toStage: 'offer',
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
        createdBy: 'dashboard',
        clientEventId: 'evt-124',
      })
    ).toBeNull();
  });

  it('rejects null source stages for non-initial pipeline events', () => {
    expect(
      transitionApplicationStage({
        applicationId: 'app-123',
        fromStage: null,
        toStage: 'selected',
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
        createdBy: 'extension',
        clientEventId: 'evt-invalid-initial',
      })
    ).toBeNull();
  });

  it('maps legacy extension and dashboard stages to canonical stages', () => {
    expect(canonicalizeLegacyApplicationStage('new')).toBe('detected');
    expect(canonicalizeLegacyApplicationStage('interested')).toBe('selected');
    expect(canonicalizeLegacyApplicationStage('applying')).toBe('application_prepared');
    expect(canonicalizeLegacyApplicationStage('draft')).toBe('selected');
    expect(canonicalizeLegacyApplicationStage('withdrawn')).toBe('archived');
    expect(canonicalizeLegacyApplicationStage('not-a-stage')).toBeNull();
  });
});
