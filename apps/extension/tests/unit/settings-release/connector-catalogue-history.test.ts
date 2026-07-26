import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_CATALOGUE_HISTORY_V1,
  CURRENT_ALL_CONNECTORS_FINGERPRINT,
  HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT,
  connectorCatalogueForFingerprint,
  validateConnectorCatalogueHistory,
  verifyAppendOnlyConnectorCatalogueHistory,
} from '../../../src/lib/shell/settings-release/connector-catalogue-history';

describe('Settings release connector catalogue history', () => {
  it('recomputes every immutable registry fingerprint and selects only exact entries', async () => {
    await expect(validateConnectorCatalogueHistory(CONNECTOR_CATALOGUE_HISTORY_V1)).resolves.toBe(
      true
    );
    expect(
      connectorCatalogueForFingerprint(
        CONNECTOR_CATALOGUE_HISTORY_V1,
        HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT
      )
    ).toMatchObject({ catalogFingerprint: HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT });
    expect(
      connectorCatalogueForFingerprint(
        CONNECTOR_CATALOGUE_HISTORY_V1,
        CURRENT_ALL_CONNECTORS_FINGERPRINT
      )
    ).toMatchObject({ catalogFingerprint: CURRENT_ALL_CONNECTORS_FINGERPRINT });
    expect(
      connectorCatalogueForFingerprint(CONNECTOR_CATALOGUE_HISTORY_V1, 'f'.repeat(64))
    ).toBeNull();
  });

  it('fails validation when an approved tuple is rewritten without its exact self-hash', async () => {
    const tampered = structuredClone(CONNECTOR_CATALOGUE_HISTORY_V1);
    tampered.catalogues[0].tuples[0][1] = false;
    await expect(validateConnectorCatalogueHistory(tampered)).resolves.toBe(false);
  });

  it('enforces UTF-8/ASCII lexical connector ordering in every exact catalogue tuple', () => {
    for (const entry of CONNECTOR_CATALOGUE_HISTORY_V1.catalogues) {
      const ids = entry.tuples.map(([id]) => id);
      expect(ids).toEqual(
        [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      );
    }
  });

  it('validates the exact independently approved first-release forms without claiming ancestry', async () => {
    const fixture = (name: string): unknown =>
      JSON.parse(
        readFileSync(resolve(process.cwd(), `tests/fixtures/settings-release/${name}`), 'utf8')
      ) as unknown;
    const receipt = fixture('connector-catalogue-history.predecessor.v1.json') as {
      schema: string;
      version: number;
      authorityStatus: string;
      predecessorJcsSha256: string;
      predecessor: unknown;
    };
    const candidate = fixture('connector-catalogue-history.candidate.v1.json') as {
      schema: string;
      version: number;
      authorityStatus: string;
      registryJcsSha256: string;
      registry: unknown;
    };

    expect(Reflect.ownKeys(receipt)).toEqual([
      'schema',
      'version',
      'authorityStatus',
      'predecessorJcsSha256',
      'predecessor',
    ]);
    expect(receipt).toMatchObject({
      schema: 'missionpulse.connector-catalogue-history-predecessor-receipt',
      version: 1,
      authorityStatus: 'approved',
    });
    expect(Reflect.ownKeys(candidate)).toEqual([
      'schema',
      'version',
      'authorityStatus',
      'registryJcsSha256',
      'registry',
    ]);
    expect(candidate).toMatchObject({
      schema: 'missionpulse.connector-catalogue-history-candidate-snapshot',
      version: 1,
      authorityStatus: 'approved',
    });
    expect(receipt.predecessorJcsSha256).toBe(sha256Jcs(receipt.predecessor));
    expect(receipt.predecessorJcsSha256).toBe(
      '1033ecb4dd9e23ca70a0ebae009663ab2196397526b6a7cce8333653f80be0b9'
    );
    expect(candidate.registryJcsSha256).toBe(sha256Jcs(candidate.registry));
    expect(candidate.registryJcsSha256).toBe(
      '9a81cff62e4d3f270e64e0fa98934535c49da6689a64a395dddf8d9191670334'
    );
    expect(candidate.registry).toEqual(CONNECTOR_CATALOGUE_HISTORY_V1);
    await expect(validateConnectorCatalogueHistory(candidate.registry)).resolves.toBe(true);
    await expect(
      validateConnectorCatalogueHistory({
        ...(candidate.registry as Record<string, unknown>),
        unapprovedExtra: true,
      })
    ).resolves.toBe(false);
    expect(JSON.stringify(receipt)).not.toContain(
      '9aceac90e02c09da73bb4f3e146da5fb13d250df41d1021a51059d614846c705'
    );
  });

  it('rejects rewriting any entry already present in a released predecessor blob', () => {
    const predecessor = {
      schema: 'missionpulse.connector-catalogue-history' as const,
      version: 1 as const,
      catalogues: [structuredClone(CONNECTOR_CATALOGUE_HISTORY_V1.catalogues[0])],
    };
    const rewritten = structuredClone(CONNECTOR_CATALOGUE_HISTORY_V1);
    rewritten.catalogues[0].tuples[0][2] = ['https://rewritten.example/*'];
    expect(verifyAppendOnlyConnectorCatalogueHistory(predecessor, rewritten)).toBe(false);
  });
});

function sha256Jcs(value: unknown): string {
  const canonicalize = (input: unknown): string => {
    if (Array.isArray(input)) {
      return `[${input.map(canonicalize).join(',')}]`;
    }
    if (input !== null && typeof input === 'object') {
      const record = input as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(input);
  };
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
