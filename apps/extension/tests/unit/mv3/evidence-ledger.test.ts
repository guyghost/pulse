import { describe, expect, it } from 'vitest';

import { MV3_LEDGER_LIMITS, createEvidenceLedger } from '../../mv3/harness/evidence-ledger';

describe('bounded MV3 evidence ledger', () => {
  it('publishes the exact reviewed count and canonical-byte budgets', () => {
    expect(MV3_LEDGER_LIMITS).toEqual({
      evidence: {
        maxItems: 4_096,
        maxItemJcsBytes: 65_536,
        maxTotalJcsBytes: 4_194_304,
      },
      maps: {
        registration: { maxEntries: 64, maxEntryJcsBytes: 4_096, maxTotalJcsBytes: 262_144 },
        version: { maxEntries: 256, maxEntryJcsBytes: 4_096, maxTotalJcsBytes: 1_048_576 },
        target: { maxEntries: 1_024, maxEntryJcsBytes: 4_096, maxTotalJcsBytes: 4_194_304 },
        session: { maxEntries: 1_024, maxEntryJcsBytes: 4_096, maxTotalJcsBytes: 4_194_304 },
        executionContext: {
          maxEntries: 4_096,
          maxEntryJcsBytes: 2_048,
          maxTotalJcsBytes: 8_388_608,
        },
        attachment: {
          maxEntries: 1_024,
          maxEntryJcsBytes: 8_192,
          maxTotalJcsBytes: 8_388_608,
        },
      },
      pendingCommands: {
        maxTotal: 256,
        maxOperational: 224,
        reservedCleanup: 32,
        maxEntryJcsBytes: 2_048,
        maxTotalJcsBytes: 524_288,
      },
    });
  });

  it('retains exactly 4096 diagnostics then emits typed overflow without retaining payloads', () => {
    const ledger = createEvidenceLedger();

    for (let index = 0; index < 4_096; index += 1) {
      expect(ledger.appendEvidence('diagnostic', { index }).accepted).toBe(true);
    }
    const overflow = ledger.appendEvidence('diagnostic', {
      index: 4_096,
      secretPayloadThatMustNotBeRetained: 'do-not-retain',
    });

    expect(overflow).toMatchObject({
      accepted: false,
      event: { type: 'EVIDENCE_OVERFLOW_RECORDED' },
    });
    expect(ledger.snapshot()).toMatchObject({
      verdict: 'blocked',
      accumulators: {
        diagnostic: {
          observedCount: 4_097,
          retainedCount: 4_096,
          overflowCount: 1,
        },
      },
    });
    expect(JSON.stringify(ledger.snapshot())).not.toContain('do-not-retain');
    expect(ledger.snapshot().accumulators.diagnostic.chainSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects one evidence item above the 65536-byte JCS cap and records only metadata', () => {
    const ledger = createEvidenceLedger();

    const overflow = ledger.appendEvidence('nestedCdp', {
      payload: 'x'.repeat(65_536),
    });

    expect(overflow).toMatchObject({
      accepted: false,
      event: { type: 'EVIDENCE_OVERFLOW_RECORDED' },
    });
    expect(ledger.snapshot()).toMatchObject({
      verdict: 'blocked',
      accumulators: {
        nestedCdp: {
          observedCount: 1,
          retainedCount: 0,
          overflowCount: 1,
        },
      },
    });
    expect(JSON.stringify(ledger.snapshot())).not.toContain('x'.repeat(128));
  });

  it('fails release when a target map exceeds its exact entry-count cap', () => {
    const ledger = createEvidenceLedger();

    for (let index = 0; index < 1_024; index += 1) {
      expect(
        ledger.setAuthorityEntry('target', `target-${index}`, {
          targetId: `target-${index}`,
          url: `chrome-extension://extension/worker-${index}.js`,
        }).accepted
      ).toBe(true);
    }
    const overflow = ledger.setAuthorityEntry('target', 'target-overflow', {
      targetId: 'target-overflow',
      url: 'chrome-extension://extension/overflow.js',
    });

    expect(overflow).toMatchObject({
      accepted: false,
      event: { type: 'EVIDENCE_OVERFLOW_RECORDED' },
    });
    expect(ledger.snapshot()).toMatchObject({
      lifecycleDirective: 'failed_releasing',
      maps: {
        target: {
          observedCount: 1_025,
          retainedCount: 1_024,
          overflowCount: 1,
        },
      },
    });
  });

  it('fails release before retaining a map entry above its canonical-byte cap', () => {
    const ledger = createEvidenceLedger();

    const overflow = ledger.setAuthorityEntry('target', 'target-oversized', {
      targetId: 'target-oversized',
      url: `chrome-extension://extension/${'x'.repeat(4_096)}.js`,
    });

    expect(overflow.accepted).toBe(false);
    expect(ledger.snapshot()).toMatchObject({
      lifecycleDirective: 'failed_releasing',
      maps: {
        target: {
          observedCount: 1,
          retainedCount: 0,
          overflowCount: 1,
        },
      },
    });
  });

  it('keeps cleanup capacity after operational overflow and serializes cleanup reuse', () => {
    const ledger = createEvidenceLedger();

    for (let index = 0; index < 224; index += 1) {
      expect(
        ledger.reservePendingCommand({
          commandId: `operational-${index}`,
          kind: 'operational',
          method: 'Runtime.enable',
        }).accepted
      ).toBe(true);
    }
    expect(
      ledger.reservePendingCommand({
        commandId: 'operational-overflow',
        kind: 'operational',
        method: 'Runtime.evaluate',
      })
    ).toMatchObject({
      accepted: false,
      event: { type: 'EVIDENCE_OVERFLOW_RECORDED' },
    });

    expect(
      ledger.reservePendingCommand({
        commandId: 'cleanup-1',
        kind: 'cleanup',
        method: 'Target.setAutoAttach',
      }).accepted
    ).toBe(true);
    expect(
      ledger.reservePendingCommand({
        commandId: 'cleanup-2',
        kind: 'cleanup',
        method: 'Target.detachFromTarget',
      }).accepted
    ).toBe(false);

    expect(ledger.releasePendingCommand('cleanup-1')).toBe(true);
    expect(
      ledger.reservePendingCommand({
        commandId: 'cleanup-2',
        kind: 'cleanup',
        method: 'Target.detachFromTarget',
      }).accepted
    ).toBe(true);
    expect(ledger.snapshot()).toMatchObject({
      lifecycleDirective: 'failed_releasing',
      pendingCommands: {
        operationalCount: 224,
        cleanupCount: 1,
        cleanupSerialized: true,
      },
    });
  });
});
