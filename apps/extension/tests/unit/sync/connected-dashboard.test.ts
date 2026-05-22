import { describe, expect, it } from 'vitest';
import {
  buildApplicationPipelineEventRows,
  buildApplicationSyncConflictRows,
  buildApplicationUpsertRow,
  buildCandidateProfileFieldSuggestionRows,
  buildCandidateProfileImportErrorRow,
  filterNewCandidateProfileFieldSuggestionRows,
  filterNewSyncConflictRows,
  buildCandidateProfileImportRows,
  buildCandidateProfileSyncConflictRows,
  buildConnectorHealthEventRow,
  buildDetectedApplicationInsertRow,
  buildDetectedApplicationPipelineEventRow,
  buildGeneratedApplicationAssetUpsertRow,
  buildMissionDuplicateUpsertRows,
  buildApplicationPullCursor,
  buildMissionScoreUpsertRow,
  buildMissionUpsertRow,
  buildProfileExtractorHealthEventRow,
  buildTrackingFromRemoteApplication,
  buildSyncStatusRow,
  mergeRemoteApplicationTracking,
  remoteCandidateProfileToUserProfile,
  shouldClearLocalCandidateProfile,
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
  nextActionAt: '2026-05-24T09:00:00.000Z',
};

const formatTimestamp = (timestamp: number): string => new Date(timestamp).toISOString();

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
      revision: 1,
      updated_by: 'extension',
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
      revision: 1,
      updated_by: 'extension',
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
        revision: 1,
        updated_by: 'extension',
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
        'extension',
        formatTimestamp
      )
    ).toEqual({
      user_id: 'user-1',
      mission_id: '9af09db6-e3ea-45c7-8d8a-6bb71dfb4c34',
      stage: 'applied',
      user_rating: 4,
      notes: 'Relancer mercredi',
      next_action_at: '2026-05-24T09:00:00.000Z',
      applied_at: '2026-05-21T08:20:00.000Z',
      archived_at: null,
      revision: 3,
      updated_by: 'extension',
    });
  });

  it('builds detected application insert rows for synced missions', () => {
    expect(
      buildDetectedApplicationInsertRow('user-1', '9af09db6-e3ea-45c7-8d8a-6bb71dfb4c34')
    ).toEqual({
      user_id: 'user-1',
      mission_id: '9af09db6-e3ea-45c7-8d8a-6bb71dfb4c34',
      stage: 'detected',
      user_rating: null,
      notes: '',
      next_action_at: null,
      applied_at: null,
      archived_at: null,
      revision: 1,
      updated_by: 'extension',
    });
  });

  it('builds idempotent detected pipeline event rows for synced missions', () => {
    expect(
      buildDetectedApplicationPipelineEventRow(mission, 'user-1', 'application-1', 'install-1')
    ).toEqual({
      user_id: 'user-1',
      application_id: 'application-1',
      from_stage: null,
      to_stage: 'detected',
      note: null,
      metadata: { localMissionId: 'free-work-123' },
      occurred_at: '2026-05-21T08:00:00.000Z',
      created_by: 'extension',
      client_event_id: 'install-1:free-work-123:1779350400000:none:detected',
      revision: 1,
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
        'install-1',
        formatTimestamp
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
        revision: 1,
        updated_by: 'extension',
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
        revision: 1,
        updated_by: 'extension',
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
        revision: 1,
        updated_by: 'extension',
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
        revision: 1,
        updated_by: 'extension',
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
      revision: 1,
      updated_by: 'extension',
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
      revision: 1,
      updated_by: 'extension',
    });
  });

  it('maps profile extractor outcomes to connector health event rows', () => {
    expect(
      buildProfileExtractorHealthEventRow({
        userId: 'user-1',
        deviceId: 'device-1',
        source: 'linkedin',
        ok: true,
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
      })
    ).toEqual({
      user_id: 'user-1',
      device_id: 'device-1',
      source: 'linkedin',
      status: 'ready',
      error_code: null,
      error_message: null,
      details: { kind: 'profile_extractor', extractorId: 'linkedin' },
      occurred_at: '2026-05-22T08:00:00.000Z',
      revision: 1,
      updated_by: 'extension',
    });

    expect(
      buildProfileExtractorHealthEventRow({
        userId: 'user-1',
        deviceId: 'device-1',
        source: 'linkedin',
        ok: false,
        errorCode: 'permission_required',
        errorMessage: 'Permission requise',
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
      })
    ).toMatchObject({
      status: 'needs_permission',
      error_code: 'permission_required',
      error_message: 'Permission requise',
    });

    expect(
      buildProfileExtractorHealthEventRow({
        userId: 'user-1',
        deviceId: 'device-1',
        source: 'linkedin',
        ok: false,
        errorCode: 'session_required',
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
      })
    ).toMatchObject({ status: 'needs_session', error_code: 'session_required' });

    expect(
      buildProfileExtractorHealthEventRow({
        userId: 'user-1',
        deviceId: 'device-1',
        source: 'linkedin',
        ok: false,
        errorCode: 'rate_limited_or_blocked',
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
      })
    ).toMatchObject({ status: 'blocked', error_code: 'rate_limited_or_blocked' });

    expect(
      buildProfileExtractorHealthEventRow({
        userId: 'user-1',
        deviceId: 'device-1',
        source: 'linkedin',
        ok: false,
        errorCode: 'sync_failed',
        occurredAt: new Date('2026-05-22T08:00:00.000Z'),
      })
    ).toMatchObject({ status: 'error', error_code: 'sync_failed' });
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
        location: 'Paris',
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
          revision: 4,
          updated_by: 'extension',
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
          revision: 4,
          updated_by: 'extension',
        },
      ],
      skills: [
        {
          profile_id: 'profile-1',
          skill: 'Svelte',
          source: 'linkedin',
          confidence: 0.8,
          revision: 4,
          updated_by: 'extension',
        },
        {
          profile_id: 'profile-1',
          skill: 'TypeScript',
          source: 'linkedin',
          confidence: 0.8,
          revision: 4,
          updated_by: 'extension',
        },
      ],
      links: [
        {
          profile_id: 'profile-1',
          label: 'Portfolio',
          url: 'https://example.com',
          source: 'linkedin',
          revision: 4,
          updated_by: 'extension',
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
        revision: 4,
        updated_by: 'extension',
        field_counts: {
          experiences: 1,
          education: 1,
          skills: 2,
          links: 1,
        },
      },
    });
  });

  it('builds failed canonical CV import rows without raw profile data', () => {
    expect(
      buildCandidateProfileImportErrorRow({
        draft: linkedinDraft,
        userId: 'user-1',
        importedAt: new Date('2026-05-22T08:05:00.000Z'),
        extractorVersion: 'linkedin-v1',
        errorCode: 'profile-sync-failed',
        errorMessage: 'profile write failed',
        rawHash: 'sha256:abc123',
      })
    ).toEqual({
      user_id: 'user-1',
      source: 'linkedin',
      status: 'error',
      imported_at: '2026-05-22T08:05:00.000Z',
      extractor_version: 'linkedin-v1',
      error_code: 'profile-sync-failed',
      error_message: 'profile write failed',
      raw_hash: 'sha256:abc123',
      revision: 1,
      updated_by: 'extension',
      field_counts: {
        experiences: 1,
        education: 1,
        skills: 2,
        links: 1,
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
          location: 'Lyon',
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
        revision: 7,
        updated_by: 'extension',
      },
      {
        user_id: 'user-1',
        profile_id: 'profile-1',
        field: 'summary',
        current_value: 'Résumé édité dans le dashboard.',
        suggested_value: 'Consultant frontend senior.',
        source: 'linkedin',
        status: 'pending',
        revision: 7,
        updated_by: 'extension',
      },
      {
        user_id: 'user-1',
        profile_id: 'profile-1',
        field: 'location',
        current_value: 'Lyon',
        suggested_value: 'Paris',
        source: 'linkedin',
        status: 'pending',
        revision: 7,
        updated_by: 'extension',
      },
      {
        user_id: 'user-1',
        profile_id: 'profile-1',
        field: 'target_role',
        current_value: 'Architecte Svelte',
        suggested_value: 'Lead Frontend Svelte',
        source: 'linkedin',
        status: 'pending',
        revision: 7,
        updated_by: 'extension',
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
          location: 'Paris',
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
            revision: 3,
            updated_by: 'extension',
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
        revision: 1,
        updated_by: 'extension',
      },
    ]);
  });

  it('filters CV field suggestions that are already pending remotely', () => {
    const rows = buildCandidateProfileFieldSuggestionRows({
      draft: linkedinDraft,
      userId: 'user-1',
      profile: {
        id: 'profile-1',
        title: 'Consultant Frontend manuel',
        summary: 'Résumé édité dans le dashboard.',
        location: 'Lyon',
        target_role: 'Architecte Svelte',
        revision: 7,
        updated_at: '2026-05-22T09:00:00.000Z',
        updated_by: 'dashboard',
      },
    });

    expect(filterNewCandidateProfileFieldSuggestionRows(rows, ['summary'])).toEqual([
      expect.objectContaining({ field: 'title' }),
      expect.objectContaining({ field: 'location' }),
      expect.objectContaining({ field: 'target_role' }),
    ]);
  });

  it('maps remote dashboard candidate profile snapshots to local scoring profiles', () => {
    expect(
      remoteCandidateProfileToUserProfile(
        {
          id: 'profile-1',
          title: 'Lead Frontend Svelte',
          summary: 'Profil dashboard',
          location: 'Paris',
          target_role: 'Architecte frontend',
          tjm_min: 650,
          tjm_max: 900,
          remote_preference: 'hybrid',
          seniority: 'senior',
          updated_at: '2026-05-22T08:00:00.000Z',
          skills: ['Svelte', 'TypeScript', 'svelte', ' '],
        },
        {
          firstName: 'Guy',
          stack: ['React'],
          tjmMin: 500,
          tjmMax: 700,
          location: 'Lyon',
          remote: 'full',
          seniority: 'confirmed',
          jobTitle: 'Développeur frontend',
          searchKeywords: ['svelte mission'],
          scoringWeights: { stack: 40, location: 20, tjm: 25, remote: 15 },
        }
      )
    ).toEqual({
      firstName: 'Guy',
      stack: ['Svelte', 'TypeScript'],
      tjmMin: 650,
      tjmMax: 900,
      location: 'Paris',
      remote: 'hybrid',
      seniority: 'senior',
      jobTitle: 'Architecte frontend',
      searchKeywords: ['svelte mission'],
      scoringWeights: { stack: 40, location: 20, tjm: 25, remote: 15 },
    });
  });

  it('uses safe local scoring defaults when dashboard profile fields are partial', () => {
    expect(
      remoteCandidateProfileToUserProfile(
        {
          id: 'profile-1',
          title: '',
          summary: '',
          location: null,
          target_role: null,
          tjm_min: null,
          tjm_max: 9000,
          remote_preference: null,
          seniority: null,
          updated_at: '2026-05-22T08:00:00.000Z',
          skills: [],
        },
        null
      )
    ).toEqual({
      firstName: 'Freelance',
      stack: [],
      tjmMin: 0,
      tjmMax: 5000,
      location: '',
      remote: 'any',
      seniority: 'senior',
      jobTitle: 'Freelance tech',
      searchKeywords: [],
      scoringWeights: undefined,
    });
  });

  it('clears a local profile only when it still matches the last connected dashboard copy', () => {
    const connectedProfile = {
      firstName: 'Guy',
      stack: ['Svelte', 'TypeScript'],
      tjmMin: 650,
      tjmMax: 900,
      location: 'Paris',
      remote: 'hybrid' as const,
      seniority: 'senior' as const,
      jobTitle: 'Architecte frontend',
      searchKeywords: ['svelte mission'],
      scoringWeights: { stack: 40, location: 20, tjm: 25, remote: 15 },
    };

    expect(shouldClearLocalCandidateProfile(connectedProfile, connectedProfile)).toBe(true);
    expect(
      shouldClearLocalCandidateProfile(
        { ...connectedProfile, stack: ['Svelte', 'TypeScript', 'Node.js'] },
        connectedProfile
      )
    ).toBe(false);
    expect(shouldClearLocalCandidateProfile(null, connectedProfile)).toBe(false);
    expect(shouldClearLocalCandidateProfile(connectedProfile, null)).toBe(false);
  });

  it('preserves the local scoring stack when the dashboard profile has no skills yet', () => {
    expect(
      remoteCandidateProfileToUserProfile(
        {
          id: 'profile-1',
          title: 'Architecte Frontend',
          summary: '',
          location: 'Paris',
          target_role: null,
          tjm_min: 650,
          tjm_max: 900,
          remote_preference: 'hybrid',
          seniority: 'senior',
          updated_at: '2026-05-22T08:00:00.000Z',
          skills: [],
        },
        {
          firstName: 'Guy',
          stack: ['Svelte', 'TypeScript'],
          tjmMin: 500,
          tjmMax: 700,
          location: 'Lyon',
          remote: 'full',
          seniority: 'confirmed',
          jobTitle: 'Développeur frontend',
          searchKeywords: ['mission svelte'],
        }
      ).stack
    ).toEqual(['Svelte', 'TypeScript']);
  });

  it('builds local tracking records from remote dashboard applications', () => {
    const remoteApplication: RemoteApplicationSnapshot = {
      id: 'application-1',
      mission_id: 'remote-mission-1',
      mission_source: 'free-work',
      mission_external_id: 'free-work-123',
      stage: 'interview',
      user_rating: 5,
      notes: 'Entretien mardi',
      next_action_at: '2026-05-26T09:00:00.000Z',
      revision: 4,
      updated_at: '2026-05-21T10:00:00.000Z',
    };

    const importedTracking = buildTrackingFromRemoteApplication(
      remoteApplication,
      'free-work-123',
      1779361200000
    );

    expect(importedTracking).toEqual({
      missionId: 'free-work-123',
      currentStatus: 'interview',
      history: [
        {
          from: null,
          to: 'detected',
          timestamp: 1779361199996,
          note: null,
        },
        {
          from: 'detected',
          to: 'selected',
          timestamp: 1779361199997,
          note: null,
        },
        {
          from: 'selected',
          to: 'application_prepared',
          timestamp: 1779361199998,
          note: null,
        },
        {
          from: 'application_prepared',
          to: 'applied',
          timestamp: 1779361199999,
          note: null,
        },
        {
          from: 'applied',
          to: 'interview',
          timestamp: 1779361200000,
          note: 'Import dashboard revision 4',
        },
      ],
      generatedAssetIds: [],
      userRating: 5,
      notes: 'Entretien mardi',
      nextActionAt: '2026-05-26T09:00:00.000Z',
    });

    expect(
      buildApplicationPipelineEventRows(
        importedTracking,
        'user-1',
        'application-1',
        'extension',
        'install-1',
        formatTimestamp
      ).map((row) => [row.from_stage, row.to_stage])
    ).toEqual([
      [null, 'detected'],
      ['detected', 'selected'],
      ['selected', 'application_prepared'],
      ['application_prepared', 'applied'],
      ['applied', 'interview'],
    ]);
  });

  it('merges remote dashboard application changes into existing local tracking', () => {
    const remoteApplication: RemoteApplicationSnapshot = {
      id: 'application-1',
      mission_id: 'remote-mission-1',
      mission_source: 'free-work',
      mission_external_id: 'free-work-123',
      stage: 'offer',
      user_rating: 5,
      notes: 'Offre reçue',
      next_action_at: '2026-05-28T09:00:00.000Z',
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
      nextActionAt: '2026-05-28T09:00:00.000Z',
    });
  });

  it('builds application sync conflicts when local revision can overlap dashboard edits', () => {
    const remoteApplication: RemoteApplicationSnapshot = {
      id: 'application-1',
      mission_id: 'remote-mission-1',
      mission_source: 'free-work',
      mission_external_id: 'free-work-123',
      stage: 'offer',
      user_rating: 5,
      notes: 'Offre reçue côté dashboard',
      next_action_at: '2026-05-28T09:00:00.000Z',
      revision: 4,
      updated_at: '2026-05-21T11:00:00.000Z',
    };

    expect(
      buildApplicationSyncConflictRows({
        userId: 'user-1',
        deviceId: 'device-1',
        existing: tracking,
        remote: remoteApplication,
        detectedAt: '2026-05-21T12:00:00.000Z',
      })
    ).toEqual([
      {
        user_id: 'user-1',
        device_id: 'device-1',
        entity: 'applications',
        entity_id: 'application-1',
        field: 'stage',
        local_value: 'applied',
        remote_value: 'offer',
        local_updated_by: 'extension',
        remote_updated_by: 'dashboard',
        status: 'pending',
        detected_at: '2026-05-21T12:00:00.000Z',
        revision: 1,
        updated_by: 'extension',
      },
      {
        user_id: 'user-1',
        device_id: 'device-1',
        entity: 'applications',
        entity_id: 'application-1',
        field: 'notes',
        local_value: 'Relancer mercredi',
        remote_value: 'Offre reçue côté dashboard',
        local_updated_by: 'extension',
        remote_updated_by: 'dashboard',
        status: 'pending',
        detected_at: '2026-05-21T12:00:00.000Z',
        revision: 1,
        updated_by: 'extension',
      },
      {
        user_id: 'user-1',
        device_id: 'device-1',
        entity: 'applications',
        entity_id: 'application-1',
        field: 'user_rating',
        local_value: '4',
        remote_value: '5',
        local_updated_by: 'extension',
        remote_updated_by: 'dashboard',
        status: 'pending',
        detected_at: '2026-05-21T12:00:00.000Z',
        revision: 1,
        updated_by: 'extension',
      },
      {
        user_id: 'user-1',
        device_id: 'device-1',
        entity: 'applications',
        entity_id: 'application-1',
        field: 'next_action_at',
        local_value: '2026-05-24T09:00:00.000Z',
        remote_value: '2026-05-28T09:00:00.000Z',
        local_updated_by: 'extension',
        remote_updated_by: 'dashboard',
        status: 'pending',
        detected_at: '2026-05-21T12:00:00.000Z',
        revision: 1,
        updated_by: 'extension',
      },
    ]);
  });

  it('does not create application conflicts when dashboard revision is newer than local history', () => {
    const remoteApplication: RemoteApplicationSnapshot = {
      id: 'application-1',
      mission_id: 'remote-mission-1',
      mission_source: 'free-work',
      mission_external_id: 'free-work-123',
      stage: 'offer',
      user_rating: 5,
      notes: 'Offre reçue',
      next_action_at: '2026-05-28T09:00:00.000Z',
      revision: 5,
      updated_at: '2026-05-21T11:00:00.000Z',
    };

    expect(
      buildApplicationSyncConflictRows({
        userId: 'user-1',
        deviceId: 'device-1',
        existing: tracking,
        remote: remoteApplication,
        detectedAt: '2026-05-21T12:00:00.000Z',
      })
    ).toEqual([]);
  });

  it('filters sync conflict rows that already have pending dashboard conflicts', () => {
    const rows = buildApplicationSyncConflictRows({
      userId: 'user-1',
      deviceId: 'device-1',
      existing: tracking,
      remote: {
        id: 'application-1',
        mission_id: 'remote-mission-1',
        mission_source: 'free-work',
        mission_external_id: 'free-work-123',
        stage: 'offer',
        user_rating: 5,
        notes: 'Offre reçue côté dashboard',
        next_action_at: '2026-05-28T09:00:00.000Z',
        revision: 4,
        updated_at: '2026-05-21T11:00:00.000Z',
      },
      detectedAt: '2026-05-21T12:00:00.000Z',
    });

    expect(filterNewSyncConflictRows(rows, ['stage', 'notes'])).toEqual([
      expect.objectContaining({ field: 'user_rating' }),
      expect.objectContaining({ field: 'next_action_at' }),
    ]);
  });

  it('advances the application pull cursor only when every remote row is handled', () => {
    const remoteApplications: RemoteApplicationSnapshot[] = [
      {
        id: 'application-older',
        mission_id: 'remote-mission-1',
        mission_source: 'free-work',
        mission_external_id: 'free-work-123',
        stage: 'selected',
        user_rating: null,
        notes: '',
        next_action_at: null,
        revision: 2,
        updated_at: '2026-05-21T10:00:00.000Z',
      },
      {
        id: 'application-newer',
        mission_id: 'remote-mission-2',
        mission_source: 'lehibou',
        mission_external_id: 'lehibou-456',
        stage: 'offer',
        user_rating: 5,
        notes: 'Offre reçue',
        next_action_at: '2026-05-28T09:00:00.000Z',
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
    ).toBeNull();
  });
});
