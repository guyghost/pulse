import { describe, expect, it, vi } from 'vitest';
import { createDefaultProfile, isDefaultProfile } from '../../../src/lib/core/profile/defaults';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import {
  ensureDurableProfileBeforeScan,
  type EnsureDurableProfileDeps,
} from '../../../src/lib/shell/onboarding/ensure-durable-profile';

function makeDeps(overrides: Partial<EnsureDurableProfileDeps> = {}) {
  return {
    getProfile: vi.fn(async (): Promise<UserProfile | null> => null),
    saveProfile: vi.fn(async () => {}),
    getDraft: vi.fn(() => ({}) as Parameters<EnsureDurableProfileDeps['getDraft']>[0]),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('ensureDurableProfileBeforeScan (P0-A1)', () => {
  it('SKIP sans profil → persiste un profil défaut (isDefaultProfile)', async () => {
    const deps = makeDeps();
    const persisted = await ensureDurableProfileBeforeScan(deps);

    expect(persisted).toBe(true);
    expect(deps.saveProfile).toHaveBeenCalledOnce();
    const saved = deps.saveProfile.mock.calls[0][0] as UserProfile;
    expect(isDefaultProfile(saved)).toBe(true);
    expect(deps.warn).not.toHaveBeenCalled();
  });

  it('profil défaut existant + draft avec signal → persiste le merge (draft gagne)', async () => {
    const existing = createDefaultProfile();
    const deps = makeDeps({
      getProfile: vi.fn(async () => existing),
      getDraft: vi.fn(() => ({ firstName: 'Guy', tjmMin: 600 })),
    });
    await ensureDurableProfileBeforeScan(deps);

    expect(deps.saveProfile).toHaveBeenCalledOnce();
    const saved = deps.saveProfile.mock.calls[0][0] as UserProfile;
    expect(saved.firstName).toBe('Guy');
    expect(saved.tjmMin).toBe(600);
    // Le reste du profil défaut est conservé.
    expect(saved.scoringWeights).toEqual(existing.scoringWeights);
  });

  it('profil durable existant → aucune écriture', async () => {
    const existing = { ...createDefaultProfile(), firstName: 'Guy', tjmMin: 650 };
    const deps = makeDeps({
      getProfile: vi.fn(async () => existing),
      getDraft: vi.fn(() => ({ tjmMin: 999 })),
    });
    const persisted = await ensureDurableProfileBeforeScan(deps);

    expect(persisted).toBe(false);
    expect(deps.saveProfile).not.toHaveBeenCalled();
  });

  it('échec de persistance → signalé, non bloquant, aucune exception', async () => {
    const deps = makeDeps({
      saveProfile: vi.fn(async () => {
        throw new Error('IndexedDB fermée');
      }),
    });
    await expect(ensureDurableProfileBeforeScan(deps)).resolves.toBe(false);
    expect(deps.warn).toHaveBeenCalledOnce();
    expect(deps.warn.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('échec de lecture du profil existant → signalé, non bloquant', async () => {
    const deps = makeDeps({
      getProfile: vi.fn(async () => {
        throw new Error('storage indisponible');
      }),
    });
    await expect(ensureDurableProfileBeforeScan(deps)).resolves.toBe(false);
    expect(deps.warn).toHaveBeenCalledOnce();
    expect(deps.saveProfile).not.toHaveBeenCalled();
  });
});
