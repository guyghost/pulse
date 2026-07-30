import { describe, expect, it } from 'vitest';

import {
  canonicalizeCopilotInput,
  computeCopilotInputHash,
} from '../../../src/lib/shell/copilot/input-hash';
import type { CopilotCreateApiInputHashMaterial } from '../../../src/lib/shell/copilot/contracts';

const material: CopilotCreateApiInputHashMaterial = {
  schemaVersion: 1,
  missionId: 'mission-1',
  kind: 'analysis',
  consent: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
  input: {
    mission: { title: 'Mission' },
    profile: {},
    experienceEvidence: [],
  },
  tjmFacts: null,
};

describe('Copilot canonical input hash', () => {
  it('is stable across object-key order while preserving array order', async () => {
    const reordered = {
      tjmFacts: null,
      input: {
        experienceEvidence: [],
        profile: {},
        mission: { title: 'Mission' },
      },
      consent: { evidenceIds: [], profileFields: [], missionFields: ['title'] },
      kind: 'analysis',
      missionId: 'mission-1',
      schemaVersion: 1,
    } as CopilotCreateApiInputHashMaterial;

    await expect(computeCopilotInputHash(material)).resolves.toBe(
      'ac5913e1b5bba8da3142511859d4256d85bc2a226462936f64abd535183423d0'
    );
    await expect(computeCopilotInputHash(reordered)).resolves.toBe(
      await computeCopilotInputHash(material)
    );
    await expect(
      computeCopilotInputHash({
        ...material,
        consent: { ...material.consent, missionFields: ['description', 'title'] },
      })
    ).resolves.not.toBe(await computeCopilotInputHash(material));
  });

  it('rejects undefined and non-finite values instead of hashing ambiguous JSON', () => {
    expect(() =>
      canonicalizeCopilotInput({
        ...material,
        input: {
          ...material.input,
          mission: { title: undefined } as never,
        },
      })
    ).toThrow(/undefined/);
    expect(() =>
      canonicalizeCopilotInput({
        ...material,
        input: {
          ...material.input,
          mission: { displayedTjm: { min: Number.NaN, max: 700, currency: 'EUR' } },
        },
      })
    ).toThrow(/non-finite/);
  });
});
