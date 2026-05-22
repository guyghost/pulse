import { describe, expect, it } from 'vitest';
import {
  buildApplicationPipelineEventRows,
  buildApplicationUpsertRow,
  buildCandidateProfileFieldSuggestionRows,
  buildCandidateProfileImportRows,
  buildCandidateProfileSyncConflictRows,
  buildConnectorHealthEventRow,
  buildGeneratedApplicationAssetUpsertRow,
  buildMissionDuplicateUpsertRows,
  buildApplicationPullCursor,
  buildMissionScoreUpsertRow,
  buildMissionUpsertRow,
  buildTrackingFromRemoteApplication,
  buildSyncStatusRow,
  mergeRemoteApplicationTracking,
  type RemoteApplicationSnapshot,
} from '../../../src/lib/core/sync/connected-dashboard';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';
import type { ConnectorHealthSnapshot } from '../../../src/lib/core/types/health';
import type { CanonicalCandidateProfileDraft } from '../../../src/lib/core/profile-extractors/types';

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

const linkedinDraft: CanonicalCandidateProfileDraft = {
  title: 'Lead Frontend Svelte',
  summary: 'Consultant frontend senior.',
  source: 'linkedin',
  confidence: 0.86,
  capturedAt: '2026-05-22T08:00:00.000Z',
  profileUrl: 'https://www.linkedin.com/in/example/',
  experiences: [
    {
      title: 'Lead Frontend',
      company: 'ScaleOps',
      location: 'Paris',
      startDate: '2021-01-01',
      endDate: null,
      isCurrent: true,
      description: 'Migration Svelte 5',
      skills: ['Svelte', 'TypeScript'],
      source: 'linkedin',
      sourceExternalId: 'experience-1',
      positionIndex: 0,
    },
  ],
  education: [
    {
      school: 'Université Paris Cité',
      degree: 'Master',
      field: 'Informatique',
      startDate: '2014-01-01',
      endDate: '2016-01-01',
      description: '',
      source: 'linkedin',
      positionIndex: 0,
    },
  ],
  skills: [
    { skill: 'Svelte', source: 'linkedin', confidence: 0.8 },
    { skill: 'TypeScript', source: 'linkedin', confidence: 0.8 },
  ],
  links: [{ label: 'Portfolio', url: 'https://example.com', source: 'linkedin' }],
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

  it('builds mission duplicate rows from remote mission identities', () => {
    expect(
      buildMissionDuplicateUpsertRows(
        [
          {
            canonicalMissionId: 'free-work-123',
            duplicateMissionId: 'lehibou-456',
            confidence: 1.2,
            reason: 'same_structured_signature',
          },
          {
            canonicalMissionId: 'missing',
            duplicateMissionId: 'lehibou-456',
            confidence: 0.9,
            reason: 'same_structured_signature',
          },
        ],
        'user-1',
        new Map([
          ['free-work-123', 'remote-canonical'],
          ['lehibou-456', 'remote-duplicate'],
        ])
      )
    ).toEqual([
      {
        user_id: 'user-1',
        canonical_mission_id: 'remote-canonical',
        duplicate_mission_id: 'remote-duplicate',
        confidence: 1,
        reason: 'same_structured_signature',
      },
    ]);
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

  it('builds idempotent generated asset rows with dashboard type names', () => {
    expect(
      buildGeneratedApplicationAssetUpsertRow(
        {
          id: 'asset-1',
          missionId: 'free-work-123',
          type: 'cover-message',
          content: 'Bonjour, votre mission m’intéresse.',
          createdAt: 1779364800000,
          modelUsed: 'gemini-nano',
        },
        'user-1',
        'application-1',
        '2026-05-21T12:00:00.000Z'
      )
    ).toEqual({
      user_id: 'user-1',
      application_id: 'application-1',
      client_asset_id: 'asset-1',
      type: 'cover_message',
      content: 'Bonjour, votre mission m’intéresse.',
      model: 'gemini-nano',
      created_at: '2026-05-21T12:00:00.000Z',
    });
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
        retryAfterAt: new Date('2026-05-21T02:05:00.000Z'),
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
      retry_after_at: '2026-05-21T02:05:00.000Z',
    });
  });

  it('builds canonical CV import rows from a LinkedIn profile draft', () => {
    expect(
      buildCandidateProfileImportRows({
        draft: linkedinDraft,
        userId: 'user-1',
        profileId: 'profile-1',
        importedAt: new Date('2026-05-22T08:05:00.000Z'),
        extractorVersion: 'linkedin-v1',
        revision: 4,
        rawHash: 'sha256:abc123',
      })
    ).toEqual({
      profile: {
        user_id: 'user-1',
        title: 'Lead Frontend Svelte',
        summary: 'Consultant frontend senior.',
        target_role: 'Lead Frontend Svelte',
        completeness: 86,
        revision: 4,
        updated_by: 'extension',
      },
      experiences: [
        {
          profile_id: 'profile-1',
          title: 'Lead Frontend',
          company: 'ScaleOps',
          location: 'Paris',
          start_date: '2021-01-01',
          end_date: null,
          is_current: true,
          description: 'Migration Svelte 5',
          skills: ['Svelte', 'TypeScript'],
          source: 'linkedin',
          source_external_id: 'experience-1',
          position_index: 0,
        },
      ],
      education: [
        {
          profile_id: 'profile-1',
          school: 'Université Paris Cité',
          degree: 'Master',
          field: 'Informatique',
          start_date: '2014-01-01',
          end_date: '2016-01-01',
          description: '',
          source: 'linkedin',
          position_index: 0,
        },
      ],
      skills: [
        { profile_id: 'profile-1', skill: 'Svelte', source: 'linkedin', confidence: 0.8 },
        { profile_id: 'profile-1', skill: 'TypeScript', source: 'linkedin', confidence: 0.8 },
      ],
      links: [
        {
          profile_id: 'profile-1',
          label: 'Portfolio',
          url: 'https://example.com',
          source: 'linkedin',
        },
      ],
      importEvent: {
        user_id: 'user-1',
        source: 'linkedin',
        status: 'success',
        imported_at: '2026-05-22T08:05:00.000Z',
        extractor_version: 'linkedin-v1',
        error_code: null,
        error_message: null,
        raw_hash: 'sha256:abc123',
        field_counts: {
          experiences: 1,
          education: 1,
          skills: 2,
          links: 1,
        },
      },
    });
  });

  it('builds field suggestions instead of overwriting dashboard-edited CV fields', () => {
    expect(
      buildCandidateProfileFieldSuggestionRows({
        draft: linkedinDraft,
        userId: 'user-1',
        profile: {
          id: 'profile-1',
          title: 'Consultant Frontend manuel',
          summary: 'Résumé édité dans le dashboard.',
          target_role: 'Architecte Svelte',
          revision: 7,
          updated_at: '2026-05-22T09:00:00.000Z',
          updated_by: 'dashboard',
        },
      })
    ).toEqual([
      {
        user_id: 'user-1',
        profile_id: 'profile-1',
        field: 'title',
        current_value: 'Consultant Frontend manuel',
        suggested_value: 'Lead Frontend Svelte',
        source: 'linkedin',
        status: 'pending',
      },
      {
        user_id: 'user-1',
        profile_id: 'profile-1',
        field: 'summary',
        current_value: 'Résumé édité dans le dashboard.',
        suggested_value: 'Consultant frontend senior.',
        source: 'linkedin',
        status: 'pending',
      },
      {
        user_id: 'user-1',
        profile_id: 'profile-1',
        field: 'target_role',
        current_value: 'Architecte Svelte',
        suggested_value: 'Lead Frontend Svelte',
        source: 'linkedin',
        status: 'pending',
      },
    ]);

    expect(
      buildCandidateProfileFieldSuggestionRows({
        draft: linkedinDraft,
        userId: 'user-1',
        profile: {
          id: 'profile-1',
          title: 'Lead Frontend Svelte',
          summary: 'Consultant frontend senior.',
          target_role: 'Lead Frontend Svelte',
          revision: 3,
          updated_at: '2026-05-22T08:00:00.000Z',
          updated_by: 'extension',
        },
      })
    ).toEqual([]);
  });

  it('builds sync conflict rows from dashboard-edited CV suggestions', () => {
    expect(
      buildCandidateProfileSyncConflictRows({
        suggestions: [
          {
            user_id: 'user-1',
            profile_id: 'profile-1',
            field: 'summary',
            current_value: 'Résumé dashboard',
            suggested_value: 'Résumé LinkedIn',
            source: 'linkedin',
            status: 'pending',
          },
        ],
        deviceId: 'device-1',
        profileId: 'profile-1',
        detectedAt: '2026-05-22T08:05:00.000Z',
      })
    ).toEqual([
      {
        user_id: 'user-1',
        device_id: 'device-1',
        entity: 'candidate_profile',
        entity_id: 'profile-1',
        field: 'summary',
        local_value: 'Résumé LinkedIn',
        remote_value: 'Résumé dashboard',
        local_updated_by: 'extension',
        remote_updated_by: 'dashboard',
        status: 'pending',
        detected_at: '2026-05-22T08:05:00.000Z',
      },
    ]);
  });

  it('builds local tracking records from remote dashboard applications', () => {
    const remoteApplication: RemoteApplicationSnapshot = {
      id: 'application-1',
      mission_id: 'remote-mission-1',
      stage: 'interview',
      user_rating: 5,
      notes: 'Entretien mardi',
      revision: 4,
      updated_at: '2026-05-21T10:00:00.000Z',
    };

    expect(
      buildTrackingFromRemoteApplication(remoteApplication, 'free-work-123', 1779361200000)
    ).toEqual({
      missionId: 'free-work-123',
      currentStatus: 'interview',
      history: [
        {
          from: null,
          to: 'interview',
          timestamp: 1779361200000,
          note: 'Import dashboard revision 4',
        },
      ],
      generatedAssetIds: [],
      userRating: 5,
      notes: 'Entretien mardi',
    });
  });

  it('merges remote dashboard application changes into existing local tracking', () => {
    const remoteApplication: RemoteApplicationSnapshot = {
      id: 'application-1',
      mission_id: 'remote-mission-1',
      stage: 'offer',
      user_rating: 5,
      notes: 'Offre reçue',
      revision: 5,
      updated_at: '2026-05-21T11:00:00.000Z',
    };

    expect(
      mergeRemoteApplicationTracking(tracking, remoteApplication, 'free-work-123', 1779364800000)
    ).toEqual({
      ...tracking,
      currentStatus: 'offer',
      history: [
        ...tracking.history,
        {
          from: 'applied',
          to: 'offer',
          timestamp: 1779364800000,
          note: 'Sync dashboard revision 5',
        },
      ],
      userRating: 5,
      notes: 'Offre reçue',
    });
  });

  it('advances the application pull cursor only when every remote row is handled', () => {
    const remoteApplications: RemoteApplicationSnapshot[] = [
      {
        id: 'application-older',
        mission_id: 'remote-mission-1',
        stage: 'selected',
        user_rating: null,
        notes: '',
        revision: 2,
        updated_at: '2026-05-21T10:00:00.000Z',
      },
      {
        id: 'application-newer',
        mission_id: 'remote-mission-2',
        stage: 'offer',
        user_rating: 5,
        notes: 'Offre reçue',
        revision: 5,
        updated_at: '2026-05-21T12:00:00.000Z',
      },
    ];

    expect(
      buildApplicationPullCursor({
        remoteApplications,
        skippedCount: 0,
        previousCursor: '2026-05-21T09:00:00.000Z',
        pulledAt: '2026-05-21T13:00:00.000Z',
      })
    ).toBe('2026-05-21T12:00:00.000Z');

    expect(
      buildApplicationPullCursor({
        remoteApplications,
        skippedCount: 1,
        previousCursor: '2026-05-21T09:00:00.000Z',
        pulledAt: '2026-05-21T13:00:00.000Z',
      })
    ).toBe('2026-05-21T09:00:00.000Z');

    expect(
      buildApplicationPullCursor({
        remoteApplications: [],
        skippedCount: 0,
        previousCursor: null,
        pulledAt: '2026-05-21T13:00:00.000Z',
      })
    ).toBe('2026-05-21T13:00:00.000Z');
  });
});
