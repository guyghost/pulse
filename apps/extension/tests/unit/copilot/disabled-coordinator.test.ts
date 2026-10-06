import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createDisabledCopilotCoordinator } from '../../../src/lib/shell/copilot/disabled-coordinator';

describe('disabled Copilot coordinator (release builds without rollout)', () => {
  it('answers every operation with ROLLOUT_DISABLED and no side effect', async () => {
    const coordinator = createDisabledCopilotCoordinator();
    const results = await Promise.all([
      coordinator.link('r1'),
      coordinator.syncEntitlement('r2'),
      coordinator.getDossier('r3', 'm1'),
      coordinator.createJob({
        requestId: 'r4',
        missionId: 'm1',
        kind: 'analysis',
        missionFields: [],
        profileFields: [],
        evidenceIds: [],
      } as unknown as Parameters<typeof coordinator.createJob>[0]),
      coordinator.getJob('r5', 'm1'),
      coordinator.cancelJob('r6', 'm1', 'j1'),
      coordinator.reviewJob('r7', 'm1', 'j1', 'accept'),
      coordinator.deleteDossier('r8', 'm1'),
    ]);

    results.forEach((result, index) => {
      expect(result.requestId).toBe(`r${index + 1}`);
      expect(result.outcome).toBe('error');
      expect(result.error?.code).toBe('ROLLOUT_DISABLED');
      expect(result.error?.retryable).toBe(false);
    });
  });

  it('is what the service worker wires when the rollout flag is off', () => {
    const background = readFileSync(resolve(process.cwd(), 'src/background/index.ts'), 'utf8');
    expect(background).toMatch(
      /if \(!isCopilotRolloutEnabled\(\)\) \{\s*return createCopilotBridgeHandler\(createDisabledCopilotCoordinator\(\)\);/
    );
    // chrome.identity is only touched behind the guarded accessor of the enabled branch.
    expect(background.match(/chrome\.identity\./g) ?? []).toEqual([]);
  });
});
