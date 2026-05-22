import { describe, expect, it } from 'vitest';
import {
  buildApplicationPipelineEventRows,
  buildApplicationUpsertRow,
  buildConnectorHealthEventRow,
  buildMissionScoreUpsertRow,
  buildMissionUpsertRow,
  buildSyncStatusRow,
} from '../../../src/lib/core/sync/connected-dashboard';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';
import type { ConnectorHealthSnapshot } from '../../../src/lib/core/types/health';

const mission: Mission = {
  id: 'free-work-123',
  title: 'Lead Svelte 5',
  client: 'ScaleOps',
  description: 'Mission Svelte 5 et TypeScript strict',
  stack: ['Svelte', 'TypeScript'],
  tjm: 720,
  location: 'Remote France',
  remote: 'full',
  duration: '6 mois',
  startDate: '2026-06-01',
  publishedAt: '2026-05-20T08:00:00.000Z',
  url: 'https://example.com/mission',
  source: 'free-work',
  scrapedAt: new Date('2026-05-21T08:00:00.000Z'),
  seniority: 'senior',
  scoreBreakdown: {
    deterministic: 86,
    semantic: 92,
    semanticReason: 'Très bon match Svelte',
    total: 89,
    grade: 'A',
    criteria: {
      stack: 90,
      location: 100,
      tjm: 80,
      remote: 100,
      seniorityBonus: 5,
      startDateBonus: 3,
    },
  },
  score: 89,
  semanticScore: 92,
  semanticReason: 'Très bon match Svelte',
};

const tracking: MissionTracking = {
  missionId: 'free-work-123',
  currentStatus: 'applied',
  history: [
    { from: null, to: 'detected', timestamp: 1779340800000, note: null },
    { from: 'detected', to: 'selected', timestamp: 1779344400000, note: 'Shortlist' },
    {
      from: 'selected',
      to: 'application_prepared',
      timestamp: 1779348000000,
      note: 'Pitch prêt',
    },
    { from: 'application_prepared', to: 'applied', timestamp: 1779351600000, note: null },
  ],
  generatedAssetIds: ['asset-1'],
  userRating: 4,
  notes: 'Relancer mercredi',
};

describe('connected dashboard sync payload builders', () => {
  it('builds mission upsert rows with a stable canonical key and sanitized raw snapshot', () => {
    expect(buildMissionUpsertRow(mission, 'user-1')).toEqual({
      user_id: 'user-1',
      source: 'free-work',
      external_id: 'free-work-123',
      canonical_key: 'lead svelte 5 scaleops remote france',
      title: 'Lead Svelte 5',
      client: 'ScaleOps',
      description: 'Mission Svelte 5 et TypeScript strict',
      stack: ['Svelte', 'TypeScript'],
      tjm: 720,
      location: 'Remote France',
      remote: 'full',
      duration: '6 mois',
      start_date: '2026-06-01',
      published_at: '2026-05-20T08:00:00.000Z',
      scraped_at: '2026-05-21T08:00:00.000Z',
      url: 'https://example.com/mission',
      raw_snapshot: {
        seniority: 'senior',
        score: 89,
        semanticScore: 92,
        semanticReason: 'Très bon match Svelte',
      },
    });
  });

  it('builds score upsert rows from the structured score breakdown', () => {
    expect(
      buildMissionScoreUpsertRow(
        mission,
        '9af09db6-e3ea-45c7-8d8a-6bb71dfb4c34',
        new Date('2026-05-21T08:01:00.000Z'),
        'missionpulse-v1'
      )
    ).toEqual({
      mission_id: '9af09db6-e3ea-45c7-8d8a-6bb71dfb4c34',
      deterministic_score: 86,
      semantic_score: 92,
      total_score: 89,
      grade: 'A',
      criteria: {
        stack: 90,
        location: 100,
        tjm: 80,
        remote: 100,
        seniorityBonus: 5,
        startDateBonus: 3,
      },
      semantic_reason: 'Très bon match Svelte',
      scorer_version: 'missionpulse-v1',
      scored_at: '2026-05-21T08:01:00.000Z',
    });
  });

  it('builds application upsert rows from local tracking state', () => {
    expect(
      buildApplicationUpsertRow(
        tracking,
        'user-1',
        '9af09db6-e3ea-45c7-8d8a-6bb71dfb4c34',
        3,
        'extension'
      )
    ).toEqual({
      user_id: 'user-1',
      mission_id: '9af09db6-e3ea-45c7-8d8a-6bb71dfb4c34',
      stage: 'applied',
      user_rating: 4,
      notes: 'Relancer mercredi',
      applied_at: '2026-05-21T08:20:00.000Z',
      archived_at: null,
      revision: 3,
      updated_by: 'extension',
    });
  });

  it('builds idempotent insert-only pipeline event rows', () => {
    expect(
      buildApplicationPipelineEventRows(
        tracking,
        'user-1',
        'application-1',
        'extension',
        'install-1'
      )
    ).toEqual([
      {
        user_id: 'user-1',
        application_id: 'application-1',
        from_stage: null,
        to_stage: 'detected',
        note: null,
        metadata: { localMissionId: 'free-work-123' },
        occurred_at: '2026-05-21T05:20:00.000Z',
        created_by: 'extension',
        client_event_id: 'install-1:free-work-123:1779340800000:none:detected',
      },
      {
        user_id: 'user-1',
        application_id: 'application-1',
        from_stage: 'detected',
        to_stage: 'selected',
        note: 'Shortlist',
        metadata: { localMissionId: 'free-work-123' },
        occurred_at: '2026-05-21T06:20:00.000Z',
        created_by: 'extension',
        client_event_id: 'install-1:free-work-123:1779344400000:detected:selected',
      },
      {
        user_id: 'user-1',
        application_id: 'application-1',
        from_stage: 'selected',
        to_stage: 'application_prepared',
        note: 'Pitch prêt',
        metadata: { localMissionId: 'free-work-123' },
        occurred_at: '2026-05-21T07:20:00.000Z',
        created_by: 'extension',
        client_event_id: 'install-1:free-work-123:1779348000000:selected:application_prepared',
      },
      {
        user_id: 'user-1',
        application_id: 'application-1',
        from_stage: 'application_prepared',
        to_stage: 'applied',
        note: null,
        metadata: { localMissionId: 'free-work-123' },
        occurred_at: '2026-05-21T08:20:00.000Z',
        created_by: 'extension',
        client_event_id: 'install-1:free-work-123:1779351600000:application_prepared:applied',
      },
    ]);
  });

  it('builds connector health event rows from health snapshots', () => {
    const snapshot: ConnectorHealthSnapshot = {
      connectorId: 'free-work',
      circuitState: 'open',
      consecutiveFailures: 5,
      totalFailures: 8,
      totalSuccesses: 12,
      lastSuccessAt: 1779340800000,
      lastFailureAt: 1779344400000,
      lastStateChangeAt: 1779348000000,
      recentLatenciesMs: [120, 180],
    };

    expect(
      buildConnectorHealthEventRow(
        snapshot,
        'user-1',
        'device-1',
        new Date('2026-05-21T02:00:00.000Z'),
        'HTTP 403'
      )
    ).toEqual({
      user_id: 'user-1',
      device_id: 'device-1',
      source: 'free-work',
      status: 'blocked',
      error_code: 'circuit_open',
      error_message: 'HTTP 403',
      details: {
        circuitState: 'open',
        consecutiveFailures: 5,
        totalFailures: 8,
        totalSuccesses: 12,
        lastSuccessAt: 1779340800000,
        lastFailureAt: 1779344400000,
        lastStateChangeAt: 1779348000000,
        recentLatenciesMs: [120, 180],
      },
      occurred_at: '2026-05-21T02:00:00.000Z',
    });
  });

  it('builds sync status rows with retryable error reporting', () => {
    expect(
      buildSyncStatusRow({
        userId: 'user-1',
        deviceId: 'device-1',
        entity: 'missions',
        lastPushAt: new Date('2026-05-21T02:00:00.000Z'),
        pendingUploadCount: 2,
        pendingDownloadCount: 1,
        error: { code: 'remote-error', message: 'Supabase unavailable' },
      })
    ).toEqual({
      user_id: 'user-1',
      device_id: 'device-1',
      entity: 'missions',
      last_pull_at: null,
      last_push_at: '2026-05-21T02:00:00.000Z',
      pending_upload_count: 2,
      pending_download_count: 1,
      last_error_code: 'remote-error',
      last_error_message: 'Supabase unavailable',
    });
  });
});
