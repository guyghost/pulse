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

const validSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work', 'lehibou'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
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

  it('accepte RESET_LOCAL_DATA', () => {
    expect(validateMessage({ type: 'RESET_LOCAL_DATA' }).valid).toBe(true);
  });

  it('accepte les messages de flags side panel sans payload', () => {
    for (const type of [
      'GET_FIRST_SCAN_DONE',
      'GET_PROFILE_BANNER_DISMISSED',
      'SET_PROFILE_BANNER_DISMISSED',
      'GET_ONBOARDING_COMPLETED',
      'SET_ONBOARDING_COMPLETED',
      'CLEAR_ONBOARDING_COMPLETED',
      'GET_FEED_TOUR_SEEN',
      'SET_FEED_TOUR_SEEN',
      'CLEAR_FEED_TOUR_SEEN',
    ]) {
      expect(validateMessage({ type }).valid).toBe(true);
    }
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

describe('validateMessage — settings bridge', () => {
  it('accepte les messages de lecture et sauvegarde settings', () => {
    expect(validateMessage({ type: 'GET_SETTINGS' }).valid).toBe(true);
    expect(validateMessage({ type: 'SETTINGS_RESULT', payload: validSettings }).valid).toBe(true);
    expect(validateMessage({ type: 'SAVE_SETTINGS', payload: validSettings }).valid).toBe(true);
    expect(validateMessage({ type: 'SETTINGS_UPDATED', payload: validSettings }).valid).toBe(true);
    expect(
      validateMessage({
        type: 'SETTINGS_SAVED',
        payload: { saved: true, settings: validSettings },
      }).valid
    ).toBe(true);
  });

  it('rejette des settings invalides', () => {
    expect(
      validateMessage({
        type: 'SAVE_SETTINGS',
        payload: { ...validSettings, scanIntervalMinutes: 0 },
      }).valid
    ).toBe(false);
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

  it('accepte un draft de profil canonique venant d’une autre plateforme enregistrable', () => {
    const maltDraft = {
      ...linkedinDraft,
      source: 'malt',
      profileUrl: 'https://www.malt.fr/profile/example',
      experiences: linkedinDraft.experiences.map((experience) => ({
        ...experience,
        source: 'malt',
      })),
      skills: linkedinDraft.skills.map((skill) => ({ ...skill, source: 'malt' })),
      education: linkedinDraft.education.map((education) => ({ ...education, source: 'malt' })),
      links: linkedinDraft.links.map((link) => ({ ...link, source: 'malt' })),
    };

    expect(
      validateMessage({
        type: 'SYNC_LINKEDIN_PROFILE_IMPORT',
        payload: { profile: maltDraft },
      }).valid
    ).toBe(true);
  });

  it('rejette un draft de profil dont les sources enfants ne correspondent pas à la source racine', () => {
    expect(
      validateMessage({
        type: 'SYNC_LINKEDIN_PROFILE_IMPORT',
        payload: { profile: { ...linkedinDraft, source: 'malt' } },
      }).valid
    ).toBe(false);
  });

  it('rejette une source mission-only pour un draft de profil canonique', () => {
    const freeWorkDraft = {
      ...linkedinDraft,
      source: 'free-work',
      experiences: linkedinDraft.experiences.map((experience) => ({
        ...experience,
        source: 'free-work',
      })),
      skills: linkedinDraft.skills.map((skill) => ({ ...skill, source: 'free-work' })),
      education: linkedinDraft.education.map((education) => ({
        ...education,
        source: 'free-work',
      })),
      links: linkedinDraft.links.map((link) => ({ ...link, source: 'free-work' })),
    };

    expect(
      validateMessage({
        type: 'SYNC_LINKEDIN_PROFILE_IMPORT',
        payload: { profile: freeWorkDraft },
      }).valid
    ).toBe(false);
  });
});

describe('validateMessage — VERIFY_PROFILE_PAGE', () => {
  it('accepte une vérification de profil avec champs attendus', () => {
    expect(
      validateMessage({
        type: 'VERIFY_PROFILE_PAGE',
        payload: {
          url: 'https://www.linkedin.com/in/example/',
          fields: [{ id: 'title', label: 'Titre', value: 'Lead Svelte' }],
        },
      }).valid
    ).toBe(true);
  });

  it('rejette une URL de vérification invalide', () => {
    expect(
      validateMessage({
        type: 'VERIFY_PROFILE_PAGE',
        payload: {
          url: 'not-a-url',
          fields: [{ id: 'title', label: 'Titre', value: 'Lead Svelte' }],
        },
      }).valid
    ).toBe(false);
  });

  it('accepte un résultat de vérification sans texte de page brut', () => {
    expect(
      validateMessage({
        type: 'PROFILE_PAGE_VERIFIED',
        payload: {
          read: { status: 'available', finalUrl: 'https://www.linkedin.com/in/example/' },
          comparisons: [
            { fieldId: 'title', label: 'Titre', expected: 'Lead Svelte', status: 'match' },
          ],
          summary: { matches: 1, mismatches: 0, missing: 0 },
        },
      }).valid
    ).toBe(true);
  });

  it('rejette un résultat qui renvoie le texte brut de la page au side panel', () => {
    expect(
      validateMessage({
        type: 'PROFILE_PAGE_VERIFIED',
        payload: {
          read: {
            status: 'available',
            finalUrl: 'https://www.linkedin.com/in/example/',
            text: 'raw page',
          },
          comparisons: [],
          summary: { matches: 0, mismatches: 0, missing: 0 },
        },
      }).valid
    ).toBe(false);
  });
});

describe('validateMessage — LOCAL_DATA_RESET', () => {
  it('accepte un reset local réussi', () => {
    expect(
      validateMessage({
        type: 'LOCAL_DATA_RESET',
        payload: { reset: true },
      }).valid
    ).toBe(true);
  });

  it('accepte un reset local échoué avec raison typée', () => {
    expect(
      validateMessage({
        type: 'LOCAL_DATA_RESET',
        payload: { reset: false, reason: 'IndexedDB deletion is blocked.' },
      }).valid
    ).toBe(true);
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

describe('validateMessage — feed local data bridge', () => {
  it('accepte les demandes de lecture feed sans payload', () => {
    expect(validateMessage({ type: 'GET_FEED_MISSIONS' }).valid).toBe(true);
    expect(validateMessage({ type: 'GET_FEED_FAVORITES' }).valid).toBe(true);
    expect(validateMessage({ type: 'GET_FEED_HIDDEN' }).valid).toBe(true);
    expect(validateMessage({ type: 'GET_FEED_SORT' }).valid).toBe(true);
    expect(validateMessage({ type: 'GET_SEEN_MISSIONS' }).valid).toBe(true);
    expect(validateMessage({ type: 'GET_PERSISTED_CONNECTOR_STATUSES' }).valid).toBe(true);
  });

  it('accepte les écritures feed locales bornées', () => {
    expect(
      validateMessage({ type: 'SAVE_FEED_FAVORITES', payload: { 'mission-1': 1779436800000 } })
        .valid
    ).toBe(true);
    expect(
      validateMessage({ type: 'SAVE_FEED_HIDDEN', payload: { 'mission-2': 1779436800000 } }).valid
    ).toBe(true);
    expect(validateMessage({ type: 'SAVE_SEEN_MISSIONS', payload: ['mission-1'] }).valid).toBe(
      true
    );
    expect(validateMessage({ type: 'SAVE_FEED_SORT', payload: 'date' }).valid).toBe(true);
    expect(validateMessage({ type: 'RESET_NEW_MISSION_COUNT' }).valid).toBe(true);
    expect(validateMessage({ type: 'CLEAR_EXTENSION_BADGE' }).valid).toBe(true);
    expect(
      validateMessage({ type: 'OPEN_EXTERNAL_URL', payload: { url: 'https://www.free-work.com/' } })
        .valid
    ).toBe(true);
  });

  it('rejette les timestamps feed négatifs', () => {
    expect(
      validateMessage({ type: 'SAVE_FEED_FAVORITES', payload: { 'mission-1': -1 } }).valid
    ).toBe(false);
  });

  it('rejette les URLs externes non HTTPS', () => {
    expect(
      validateMessage({ type: 'OPEN_EXTERNAL_URL', payload: { url: 'http://example.com/' } }).valid
    ).toBe(false);
  });

  it('accepte les statuts connecteurs persistés', () => {
    expect(
      validateMessage({
        type: 'PERSISTED_CONNECTOR_STATUSES_RESULT',
        payload: [
          {
            connectorId: 'free-work',
            connectorName: 'Free-Work',
            lastState: 'done',
            missionsCount: 2,
            error: null,
            lastSyncAt: 1779436800000,
            lastSuccessAt: 1779436800000,
          },
        ],
      }).valid
    ).toBe(true);
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
// UPDATE_TRACKING_DETAILS — champs de suivi synchronises
// ============================================================================

describe('validateMessage — UPDATE_TRACKING_DETAILS', () => {
  it('accepte une prochaine action ISO', () => {
    const r = validateMessage({
      type: 'UPDATE_TRACKING_DETAILS',
      payload: { missionId: 'm1', nextActionAt: '2026-05-24T09:00:00.000Z' },
    });
    expect(r.valid).toBe(true);
  });

  it('accepte la suppression de prochaine action', () => {
    const r = validateMessage({
      type: 'UPDATE_TRACKING_DETAILS',
      payload: { missionId: 'm1', nextActionAt: null },
    });
    expect(r.valid).toBe(true);
  });

  it('rejette une date invalide', () => {
    const r = validateMessage({
      type: 'UPDATE_TRACKING_DETAILS',
      payload: { missionId: 'm1', nextActionAt: 'demain' },
    });
    expect(r.valid).toBe(false);
  });
});

// ============================================================================
// TRACKING_UPDATED — payload canonique
// ============================================================================

describe('validateMessage — TRACKING_UPDATED', () => {
  it('accepte un tracking canonique complet', () => {
    const r = validateMessage({
      type: 'TRACKING_UPDATED',
      payload: {
        missionId: 'm1',
        currentStatus: 'application_prepared',
        history: [
          { from: null, to: 'detected', timestamp: 1779436800000, note: null },
          { from: 'detected', to: 'selected', timestamp: 1779436900000, note: null },
          {
            from: 'selected',
            to: 'application_prepared',
            timestamp: 1779437000000,
            note: 'Pitch prêt',
          },
        ],
        generatedAssetIds: ['asset-1'],
        userRating: 4,
        notes: 'Bon fit Svelte',
        nextActionAt: '2026-05-24T09:00:00.000Z',
      },
    });

    expect(r.valid).toBe(true);
  });

  it('rejette un tracking contenant un statut legacy', () => {
    const r = validateMessage({
      type: 'TRACKING_UPDATED',
      payload: {
        missionId: 'm1',
        currentStatus: 'interested',
        history: [{ from: null, to: 'new', timestamp: 1779436800000, note: null }],
        generatedAssetIds: [],
        userRating: null,
        notes: '',
        nextActionAt: null,
      },
    });

    expect(r.valid).toBe(false);
  });
});

// ============================================================================
// TJM analysis
// ============================================================================

describe('validateMessage — TJM analysis', () => {
  it('accepte une demande d’analyse TJM filtrée', () => {
    const r = validateMessage({
      type: 'GET_TJM_ANALYSIS',
      payload: { profileStacks: ['Svelte', 'TypeScript'], region: 'remote' },
    });
    expect(r.valid).toBe(true);
  });

  it('accepte un résultat d’analyse TJM nullable', () => {
    expect(
      validateMessage({
        type: 'TJM_ANALYSIS_RESULT',
        payload: { analysis: null },
      }).valid
    ).toBe(true);
  });

  it('rejette une région TJM inconnue', () => {
    const r = validateMessage({
      type: 'GET_TJM_ANALYSIS',
      payload: { region: 'moon' },
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
