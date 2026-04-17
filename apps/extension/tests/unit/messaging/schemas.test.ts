import { describe, it, expect } from 'vitest';
import { validateMessage, MessageSchemas } from '../../../src/lib/shell/messaging/schemas';

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
      payload: { missionId: 'm1', generationType: 'cover-letter' },
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
