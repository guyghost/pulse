import { describe, it, expect } from 'vitest';
import { validateMessage } from '../../../src/lib/shell/messaging/schemas';

const linkedinDraft = {
  title: 'Consultant Svelte senior',
  summary: 'Résumé LinkedIn normalisé.',
  experiences: [
    {
      title: 'Lead Frontend',
      company: 'Atelier Nova',
      location: 'Paris',
      startDate: '2024-01-01',
      endDate: null,
      isCurrent: true,
      description: 'Pilotage produit Svelte.',
      skills: ['Svelte', 'TypeScript'],
      source: 'linkedin',
      sourceExternalId: 'linkedin-experience-0',
      positionIndex: 0,
    },
  ],
  skills: [
    {
      skill: 'Svelte',
      source: 'linkedin',
      confidence: 0.8,
    },
  ],
  education: [
    {
      school: 'Université Paris',
      degree: 'Master',
      field: 'Informatique',
      startDate: '2014-01-01',
      endDate: '2016-01-01',
      description: '',
      source: 'linkedin',
      positionIndex: 0,
    },
  ],
  links: [
    {
      label: 'LinkedIn',
      url: 'https://www.linkedin.com/in/example/',
      source: 'linkedin',
    },
  ],
  source: 'linkedin',
  confidence: 0.85,
  capturedAt: '2026-05-22T10:00:00.000Z',
  profileUrl: 'https://www.linkedin.com/in/example/',
};

// ============================================================================
// validateMessage — structure de base
// ============================================================================

describe('validateMessage — structure de base', () => {
  it('rejette null', () => {
    const r = validateMessage(null);
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.messageType).toBeUndefined();
    }
  });

  it('rejette une string', () => {
    const r = validateMessage('SCAN_START');
    expect(r.valid).toBe(false);
  });

  it('rejette un objet sans champ type', () => {
    const r = validateMessage({ payload: {} });
    expect(r.valid).toBe(false);
  });

  it('accepte un type inconnu (backward compat)', () => {
    const r = validateMessage({ type: 'FUTURE_MESSAGE', payload: {} });
    expect(r.valid).toBe(true);
  });
});

// ============================================================================
// Messages sans payload
// ============================================================================

describe('validateMessage — messages sans payload', () => {
  it('accepte SCAN_START', () => {
    expect(validateMessage({ type: 'SCAN_START' }).valid).toBe(true);
  });

  it('accepte SCAN_CANCEL', () => {
    expect(validateMessage({ type: 'SCAN_CANCEL' }).valid).toBe(true);
  });

  it('accepte GET_PROFILE', () => {
    expect(validateMessage({ type: 'GET_PROFILE' }).valid).toBe(true);
  });

  it('accepte AUTH_LOGOUT', () => {
    expect(validateMessage({ type: 'AUTH_LOGOUT' }).valid).toBe(true);
  });
});

// ============================================================================
// SAVE_PROFILE — limite 10 Ko
// ============================================================================

describe('validateMessage — SAVE_PROFILE', () => {
  it('accepte un payload valide', () => {
    const r = validateMessage({
      type: 'SAVE_PROFILE',
      payload: { skills: ['React'], tjmMin: 500 },
    });
    expect(r.valid).toBe(true);
  });

  it('rejette un payload dépassant 10 Ko', () => {
    const huge = { type: 'SAVE_PROFILE', payload: { bio: 'x'.repeat(11_000) } };
    const r = validateMessage(huge);
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.some((e) => e.includes('10KB'))).toBe(true);
    }
  });
});

// ============================================================================
// IMPORT_LINKEDIN_PROFILE
// ============================================================================

describe('validateMessage — IMPORT_LINKEDIN_PROFILE', () => {
  it('accepte une demande sans payload depuis le side panel', () => {
    expect(validateMessage({ type: 'IMPORT_LINKEDIN_PROFILE' }).valid).toBe(true);
  });

  it("accepte une demande ciblant l'onglet actif connu", () => {
    expect(validateMessage({ type: 'IMPORT_LINKEDIN_PROFILE', payload: { tabId: 42 } }).valid).toBe(
      true
    );
  });

  it('rejette un tabId invalide', () => {
    expect(validateMessage({ type: 'IMPORT_LINKEDIN_PROFILE', payload: { tabId: -1 } }).valid).toBe(
      false
    );
  });
});

describe('validateMessage — LinkedIn preview and sync import', () => {
  it('accepte une demande de preview sans payload depuis le side panel', () => {
    expect(validateMessage({ type: 'PREVIEW_LINKEDIN_PROFILE' }).valid).toBe(true);
  });

  it("accepte une demande de preview ciblant l'onglet actif connu", () => {
    expect(
      validateMessage({ type: 'PREVIEW_LINKEDIN_PROFILE', payload: { tabId: 42 } }).valid
    ).toBe(true);
  });

  it('rejette un tabId de preview invalide', () => {
    expect(
      validateMessage({ type: 'PREVIEW_LINKEDIN_PROFILE', payload: { tabId: -1 } }).valid
    ).toBe(false);
  });

  it('accepte une preview LinkedIn extraite', () => {
    expect(
      validateMessage({
        type: 'LINKEDIN_PROFILE_PREVIEWED',
        payload: { extracted: true, profile: linkedinDraft },
      }).valid
    ).toBe(true);
  });

  it('accepte une erreur de preview LinkedIn typée', () => {
    expect(
      validateMessage({
        type: 'LINKEDIN_PROFILE_PREVIEWED',
        payload: {
          extracted: false,
          errorCode: 'session_required',
          errorMessage: 'Session LinkedIn requise.',
        },
      }).valid
    ).toBe(true);
  });

  it('accepte une demande de sync du draft LinkedIn confirmé', () => {
    expect(
      validateMessage({
        type: 'SYNC_LINKEDIN_PROFILE_IMPORT',
        payload: { profile: linkedinDraft },
      }).valid
    ).toBe(true);
  });

  it('rejette une demande de sync LinkedIn avec une source non supportée', () => {
    expect(
      validateMessage({
        type: 'SYNC_LINKEDIN_PROFILE_IMPORT',
        payload: { profile: { ...linkedinDraft, source: 'other' } },
      }).valid
    ).toBe(false);
  });
});

// ============================================================================
// MISSIONS_UPDATED — limite 500 items
// ============================================================================

describe('validateMessage — MISSIONS_UPDATED', () => {
  const validMission = { id: 'm1', title: 'Dev React', source: 'freework' };

  it("accepte jusqu'à 500 missions", () => {
    const missions = Array.from({ length: 500 }, (_, i) => ({ ...validMission, id: `m${i}` }));
    const r = validateMessage({ type: 'MISSIONS_UPDATED', payload: missions });
    expect(r.valid).toBe(true);
  });

  it('rejette plus de 500 missions', () => {
    const missions = Array.from({ length: 501 }, (_, i) => ({ ...validMission, id: `m${i}` }));
    const r = validateMessage({ type: 'MISSIONS_UPDATED', payload: missions });
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.some((e) => e.includes('500'))).toBe(true);
    }
  });

  it("rejette un payload qui n'est pas un array", () => {
    const r = validateMessage({ type: 'MISSIONS_UPDATED', payload: 'not-an-array' });
    expect(r.valid).toBe(false);
  });
});

// ============================================================================
// UPDATE_TRACKING — statuts valides
// ============================================================================

describe('validateMessage — UPDATE_TRACKING', () => {
  it('accepte un payload valide', () => {
    const r = validateMessage({
      type: 'UPDATE_TRACKING',
      payload: { missionId: 'm1', status: 'applied' },
    });
    expect(r.valid).toBe(true);
  });

  it('accepte un note optionnelle', () => {
    const r = validateMessage({
      type: 'UPDATE_TRACKING',
      payload: { missionId: 'm1', status: 'interview', note: 'Rappel lundi' },
    });
    expect(r.valid).toBe(true);
  });

  it('rejette un statut invalide', () => {
    const r = validateMessage({
      type: 'UPDATE_TRACKING',
      payload: { missionId: 'm1', status: 'hacked' },
    });
    expect(r.valid).toBe(false);
  });

  it('rejette une note dépassant 2048 chars', () => {
    const r = validateMessage({
      type: 'UPDATE_TRACKING',
      payload: { missionId: 'm1', status: 'applied', note: 'x'.repeat(2049) },
    });
    expect(r.valid).toBe(false);
  });
});

// ============================================================================
// AUTH — email/password
// ============================================================================

describe('validateMessage — AUTH_LOGIN', () => {
  it('accepte des credentials valides', () => {
    const r = validateMessage({
      type: 'AUTH_LOGIN',
      payload: { email: 'user@example.com', password: 'securepass' },
    });
    expect(r.valid).toBe(true);
  });

  it('rejette un email invalide', () => {
    const r = validateMessage({
      type: 'AUTH_LOGIN',
      payload: { email: 'not-an-email', password: 'securepass' },
    });
    expect(r.valid).toBe(false);
  });

  it('rejette un mot de passe trop court (< 6 chars)', () => {
    const r = validateMessage({
      type: 'AUTH_LOGIN',
      payload: { email: 'user@example.com', password: '123' },
    });
    expect(r.valid).toBe(false);
  });
});

// ============================================================================
// SYNC_FAVORITE_MISSION
// ============================================================================

describe('validateMessage — SYNC_FAVORITE_MISSION', () => {
  it('accepte un favori à synchroniser', () => {
    const r = validateMessage({
      type: 'SYNC_FAVORITE_MISSION',
      payload: { missionId: 'm1', favoritedAt: 1773230400000 },
    });
    expect(r.valid).toBe(true);
  });

  it('accepte la suppression distante du favori', () => {
    const r = validateMessage({
      type: 'SYNC_FAVORITE_MISSION',
      payload: { missionId: 'm1', favoritedAt: null },
    });
    expect(r.valid).toBe(true);
  });

  it('rejette les timestamps invalides', () => {
    const r = validateMessage({
      type: 'SYNC_FAVORITE_MISSION',
      payload: { missionId: 'm1', favoritedAt: -1 },
    });
    expect(r.valid).toBe(false);
  });
});

// ============================================================================
// Connected dashboard sync
// ============================================================================

describe('validateMessage — connected dashboard sync', () => {
  it('accepte une demande de statut sync connecté', () => {
    expect(validateMessage({ type: 'GET_CONNECTED_SYNC_STATUS' }).valid).toBe(true);
  });

  it('accepte une demande de retry manuel', () => {
    expect(validateMessage({ type: 'SYNC_CONNECTED_DASHBOARD' }).valid).toBe(true);
  });

  it('accepte une demande explicite de retry sync connecté', () => {
    expect(validateMessage({ type: 'RETRY_CONNECTED_SYNC' }).valid).toBe(true);
  });

  it('accepte un résultat de statut sync connecté', () => {
    const r = validateMessage({
      type: 'CONNECTED_SYNC_STATUS_RESULT',
      payload: {
        authenticated: true,
        installId: 'install-1',
        lastGlobalSync: 1779340800000,
        entities: [
          {
            entity: 'applications',
            label: 'Candidatures',
            state: 'error',
            lastPullAt: '2026-05-22T08:00:00.000Z',
            lastPushAt: null,
            pendingUploadCount: 0,
            pendingDownloadCount: 1,
            lastErrorCode: 'remote-error',
            lastErrorMessage: 'Supabase indisponible',
            retryAfterAt: '2026-05-22T08:05:00.000Z',
            updatedAt: '2026-05-22T08:00:00.000Z',
          },
        ],
      },
    });
    expect(r.valid).toBe(true);
  });

  it('rejette un résultat de sync connecté avec compteurs négatifs', () => {
    const r = validateMessage({
      type: 'CONNECTED_DASHBOARD_SYNCED',
      payload: {
        synced: true,
        missions: -1,
      },
    });
    expect(r.valid).toBe(false);
  });
});

// ============================================================================
// SHOW_TOAST
// ============================================================================

describe('validateMessage — SHOW_TOAST', () => {
  it('accepte un toast valide', () => {
    const r = validateMessage({
      type: 'SHOW_TOAST',
      payload: { message: 'Hello', toastType: 'success', duration: 3000 },
    });
    expect(r.valid).toBe(true);
  });

  it('rejette un toastType invalide', () => {
    const r = validateMessage({
      type: 'SHOW_TOAST',
      payload: { message: 'Hello', toastType: 'critical' },
    });
    expect(r.valid).toBe(false);
  });

  it('rejette un duration hors limites', () => {
    const r = validateMessage({
      type: 'SHOW_TOAST',
      payload: { message: 'Hello', toastType: 'info', duration: 999_999 },
    });
    expect(r.valid).toBe(false);
  });
});

// ============================================================================
// GENERATE_ASSET
// ============================================================================

describe('validateMessage — GENERATE_ASSET', () => {
  it('accepte un payload valide', () => {
    const r = validateMessage({
      type: 'GENERATE_ASSET',
      payload: { missionId: 'm1', generationType: 'cover-message' },
    });
    expect(r.valid).toBe(true);
  });

  it('rejette un generationType invalide', () => {
    const r = validateMessage({
      type: 'GENERATE_ASSET',
      payload: { missionId: 'm1', generationType: 'magic' },
    });
    expect(r.valid).toBe(false);
  });
});
