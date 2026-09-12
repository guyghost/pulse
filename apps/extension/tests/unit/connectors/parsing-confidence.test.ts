/**
 * Pure unit tests for the « À vérifier » review-queue logic.
 * Mock-free: every function is a deterministic pure function of its inputs
 * (see src/models/parsing-confidence.model.md).
 */

import { describe, expect, it } from 'vitest';

import {
  collectDuplicateMissionIds,
  collectSuspectConnectorIds,
  computeParsingConfidence,
  deriveReviewQueue,
  detectFieldSignals,
  FLAG_THRESHOLD,
  MIN_TITLE_LENGTH,
  primaryReasonLabel,
} from '$lib/core/connectors/parsing-confidence';
import { createMission } from '$lib/core/connectors/parser-utils';
import type { Mission } from '$lib/core/types/mission';
import type { ReviewDecisionMap } from '$lib/core/types/parsing-confidence';

const NOW = new Date('2026-02-10T12:00:00Z');

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return createMission({
    id: 'm-1',
    title: 'Développeur React senior',
    client: 'ACME',
    description: 'Mission de six mois sur une application React avec TypeScript, tests et CI.',
    stack: ['react'],
    tjm: 620,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    url: 'https://example.com/mission-1',
    source: 'free-work',
    scrapedAt: NOW,
    startDate: '2026-04-01',
    publishedAt: '2026-02-01',
    ...overrides,
  });
}

describe('detectFieldSignals', () => {
  it('returns no signals for a well-formed mission', () => {
    const mission = makeMission({
      startDate: '2026-04-01',
      publishedAt: '2026-02-01',
    });
    expect(detectFieldSignals(mission)).toEqual([]);
  });

  it('flags tjm_missing when tjm and range are all null', () => {
    expect(detectFieldSignals(makeMission({ tjm: null }))).toEqual(['tjm_missing']);
  });

  it('does not flag tjm_missing when only a range is announced', () => {
    const signals = detectFieldSignals(makeMission({ tjm: null, tjmMin: 500, tjmMax: 700 }));
    expect(signals).not.toContain('tjm_missing');
  });

  it('flags date_ambiguous for a malformed startDate', () => {
    const signals = detectFieldSignals(makeMission({ startDate: 'début avril' }));
    expect(signals).toContain('date_ambiguous');
  });

  it('flags date_ambiguous for a malformed publishedAt', () => {
    const signals = detectFieldSignals(makeMission({ publishedAt: 'hier matin' }));
    expect(signals).toContain('date_ambiguous');
  });

  it('flags date_ambiguous when no date is present at all', () => {
    const signals = detectFieldSignals(makeMission({ startDate: null, publishedAt: null }));
    expect(signals).toEqual(['date_ambiguous']);
  });

  it('flags incomplete_fields for a too-short title', () => {
    const signals = detectFieldSignals(makeMission({ title: 'Dev' }));
    expect(signals).toContain('incomplete_fields');
    expect(MIN_TITLE_LENGTH).toBeGreaterThan('Dev'.length);
  });

  it('flags incomplete_fields for a too-short description', () => {
    const signals = detectFieldSignals(makeMission({ description: 'Trop court.' }));
    expect(signals).toContain('incomplete_fields');
  });
});

describe('computeParsingConfidence', () => {
  it('returns 1 for a mission without signals', () => {
    expect(computeParsingConfidence(makeMission(), new Set())).toBe(1);
  });

  it('subtracts one weight per signal (tjm only → 0.70)', () => {
    const confidence = computeParsingConfidence(makeMission({ tjm: null }), new Set());
    expect(confidence).toBe(0.7);
  });

  it('combines field and external signals', () => {
    const mission = makeMission({ tjm: null });
    const confidence = computeParsingConfidence(mission, new Set(['near_duplicate']));
    expect(confidence).toBe(0.4);
  });

  it('clamps to 0 when weights exceed 1', () => {
    const mission = makeMission({
      tjm: null,
      startDate: null,
      publishedAt: null,
      title: 'Dev',
      description: 'Court',
    });
    const confidence = computeParsingConfidence(
      mission,
      new Set(['near_duplicate', 'parser_suspect'])
    );
    expect(confidence).toBe(0);
  });

  it('stays within [0, 1] for every input (invariant)', () => {
    const variants = [
      makeMission(),
      makeMission({ tjm: null }),
      makeMission({ title: 'x', description: 'y', tjm: null, startDate: 'nope' }),
    ];
    for (const variant of variants) {
      const confidence = computeParsingConfidence(variant, new Set(['parser_suspect']));
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('clampConfidence behaviour via computeParsingConfidence', () => {
  it('rounds to 2 decimals', () => {
    // near_duplicate (0.30) + parser_suspect (0.15) alone → 0.55.
    const mission = makeMission();
    const confidence = computeParsingConfidence(
      mission,
      new Set(['near_duplicate', 'parser_suspect'])
    );
    expect(confidence).toBe(0.55);
  });
});

describe('collectDuplicateMissionIds', () => {
  it('flags near-duplicate missions via the dedup logic', () => {
    const original = makeMission({ id: 'a' });
    const duplicate = makeMission({ id: 'b', url: 'https://example.com/mission-2' });
    const duplicates = collectDuplicateMissionIds([original, duplicate]);
    expect(duplicates.has('b')).toBe(true);
    expect(duplicates.has('a')).toBe(false);
  });

  it('returns nothing for clearly distinct missions', () => {
    const distinct = collectDuplicateMissionIds([
      makeMission({
        id: 'a',
        title: 'Data engineer Python',
        client: 'DataCorp',
        location: 'Lyon',
        tjm: 700,
        stack: ['python', 'airflow'],
      }),
      makeMission({
        id: 'b',
        title: 'Infirmier bloc opératoire',
        client: 'Clinique Saint-Louis',
        location: 'Nantes',
        tjm: 250,
        stack: [],
      }),
    ]);
    expect(distinct.size).toBe(0);
  });
});

describe('collectSuspectConnectorIds', () => {
  it('flags connectors with consecutive zero-result scans', () => {
    const suspect = collectSuspectConnectorIds([
      { connectorId: 'free-work', lastMissionCount: 0, lastSuccessAt: 100, consecutiveZeros: 5 },
    ]);
    expect(suspect.has('free-work')).toBe(true);
  });

  it('flags connectors whose last scan produced zero missions after working', () => {
    const suspect = collectSuspectConnectorIds([
      { connectorId: 'malt', lastMissionCount: 0, lastSuccessAt: 100, consecutiveZeros: 1 },
    ]);
    expect(suspect.has('malt')).toBe(true);
  });

  it('ignores never-worked connectors with a single empty scan and healthy records', () => {
    const suspect = collectSuspectConnectorIds([
      { connectorId: 'hiway', lastMissionCount: 0, lastSuccessAt: null, consecutiveZeros: 1 },
      { connectorId: 'lehibou', lastMissionCount: 12, lastSuccessAt: 200, consecutiveZeros: 0 },
    ]);
    expect(suspect.size).toBe(0);
  });
});

describe('primaryReasonLabel', () => {
  it('follows the model priority order', () => {
    expect(primaryReasonLabel(['incomplete_fields', 'tjm_missing'])).toBe('TJM manquant');
    expect(primaryReasonLabel(['near_duplicate', 'date_ambiguous'])).toBe('Date ambiguë');
    expect(primaryReasonLabel(['incomplete_fields', 'near_duplicate'])).toBe('Doublon potentiel');
    expect(primaryReasonLabel(['incomplete_fields'])).toBe('Champs incomplets');
  });

  it('returns no label for parser-only signals', () => {
    expect(primaryReasonLabel(['parser_suspect'])).toBe('');
  });
});

describe('deriveReviewQueue', () => {
  const duplicates = new Set<string>();
  const suspects = new Set<string>();

  it('keeps only missions below the flag threshold', () => {
    const clean = makeMission({ id: 'clean' });
    const missingTjm = makeMission({ id: 'no-tjm', tjm: null });
    const entries = deriveReviewQueue([clean, missingTjm], {}, duplicates, suspects);
    expect(entries.map((entry) => entry.mission.id)).toEqual(['no-tjm']);
    expect(FLAG_THRESHOLD).toBe(0.75);
  });

  it('excludes decided missions (kept and dismissed never reappear)', () => {
    const decisions: ReviewDecisionMap = {
      keptOne: { status: 'kept', decidedAt: 1 },
      goneOne: { status: 'dismissed', decidedAt: 2 },
    };
    const missions = [
      makeMission({ id: 'keptOne', tjm: null }),
      makeMission({ id: 'goneOne', tjm: null }),
      makeMission({ id: 'stillThere', tjm: null }),
    ];
    const entries = deriveReviewQueue(missions, decisions, duplicates, suspects);
    expect(entries.map((entry) => entry.mission.id)).toEqual(['stillThere']);
  });

  it('sorts worst confidence first', () => {
    const light = makeMission({ id: 'light', tjm: null, tjmMin: null, tjmMax: null });
    const heavy = makeMission({
      id: 'heavy',
      tjm: null,
      title: 'Dev',
      description: 'Court',
    });
    const entries = deriveReviewQueue([heavy, light], {}, duplicates, suspects);
    expect(entries.map((entry) => entry.mission.id)).toEqual(['heavy', 'light']);
    expect(entries[0].confidence).toBeLessThanOrEqual(entries[1].confidence);
  });

  it('surfaces near-duplicates with the right reason', () => {
    const original = makeMission({ id: 'original' });
    const duplicate = makeMission({ id: 'twin', url: 'https://example.com/other' });
    const twinIds = collectDuplicateMissionIds([original, duplicate]);
    const entries = deriveReviewQueue([duplicate], {}, twinIds, suspects);
    expect(entries).toHaveLength(1);
    expect(entries[0].primaryReasonLabel).toBe('Doublon potentiel');
    // near_duplicate alone = 0.70 < 0.75 → flagged.
    expect(entries[0].confidence).toBeLessThan(0.75);
  });

  it('flags a near-duplicate on its own (0.70 below threshold)', () => {
    const confidence = computeParsingConfidence(makeMission(), new Set(['near_duplicate']));
    expect(confidence).toBe(0.7);
    expect(confidence < FLAG_THRESHOLD).toBe(true);
  });

  it('marks parserSuspect and drives the suspect connector from health records', () => {
    const suspectConnectors = collectSuspectConnectorIds([
      { connectorId: 'free-work', lastMissionCount: 0, lastSuccessAt: 100, consecutiveZeros: 6 },
    ]);
    const mission = makeMission({ id: 'suspect-mission', tjm: null });
    const entries = deriveReviewQueue([mission], {}, duplicates, suspectConnectors);
    expect(entries).toHaveLength(1);
    expect(entries[0].parserSuspect).toBe(true);
    expect(entries[0].signals).toContain('parser_suspect');
  });

  it('does not flag a parser-suspect mission whose fields are complete', () => {
    const suspectConnectors = collectSuspectConnectorIds([
      { connectorId: 'free-work', lastMissionCount: 0, lastSuccessAt: 100, consecutiveZeros: 6 },
    ]);
    const entries = deriveReviewQueue(
      [makeMission({ id: 'fine' })],
      {},
      duplicates,
      suspectConnectors
    );
    expect(entries).toHaveLength(0);
  });

  it('satisfies the model invariants on every entry', () => {
    const missions = [
      makeMission({ id: 'a', tjm: null }),
      makeMission({ id: 'b', title: 'Dev', description: 'Court', tjm: null }),
      makeMission({ id: 'c', startDate: 'unparseable', tjm: null }),
    ];
    const entries = deriveReviewQueue(missions, {}, duplicates, suspects);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.confidence).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeLessThan(FLAG_THRESHOLD);
      expect(entry.signals.length).toBeGreaterThanOrEqual(1);
      expect(entry.primaryReasonLabel).not.toBe('');
    }
  });
});
