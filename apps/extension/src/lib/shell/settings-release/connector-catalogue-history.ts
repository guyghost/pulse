import {
  captureSettingsReleaseData,
  connectorCatalogFingerprint,
} from './settings-release.contract';

export type ConnectorCatalogueTupleV1 = readonly [
  connectorId: string,
  included: boolean,
  sortedHostPermissions: readonly string[],
];

export interface ConnectorCatalogueHistoryV1 {
  schema: 'missionpulse.connector-catalogue-history';
  version: 1;
  catalogues: readonly {
    catalogFingerprint: string;
    tuples: readonly ConnectorCatalogueTupleV1[];
  }[];
}

export const HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT =
  '7d6f226e18b8dbb40d8843a9b869608dcf1c5888894cb9afc151cfd9aa0970f7' as const;
export const CURRENT_ALL_CONNECTORS_FINGERPRINT =
  'c9e1c0e29cf8ee05beb1b657f48edc9ef04600969a139906c9d35303cc79098c' as const;
export const CURRENT_PRODUCTION_CONNECTORS_FINGERPRINT =
  '82dcefb0db1cf25137c1a1bdfd9ad0eb0120a842376097a773019b78134eb9e0' as const;

const BASE_TUPLES = [
  ['cherry-pick', true, ['https://app.cherry-pick.io/*']],
  ['collective', true, ['https://*.collective.work/*']],
  ['free-work', true, ['https://www.free-work.com/*']],
  ['hiway', true, ['https://hiway-missions.fr/*', 'https://jhgjtlkfewuiiofxfrvh.supabase.co/*']],
  ['lehibou', true, ['https://*.lehibou.com/*']],
  ['malt', true, ['https://*.malt.fr/*', 'https://*.malt.io/*']],
] as const satisfies readonly ConnectorCatalogueTupleV1[];

export const CONNECTOR_CATALOGUE_HISTORY_V1 = {
  schema: 'missionpulse.connector-catalogue-history',
  version: 1,
  catalogues: [
    {
      catalogFingerprint: HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT,
      tuples: BASE_TUPLES.map((tuple) =>
        tuple[0] === 'hiway'
          ? ([tuple[0], tuple[1], ['https://hiway-missions.fr/*']] as const)
          : tuple
      ),
    },
    {
      catalogFingerprint: CURRENT_ALL_CONNECTORS_FINGERPRINT,
      tuples: BASE_TUPLES,
    },
    {
      catalogFingerprint: CURRENT_PRODUCTION_CONNECTORS_FINGERPRINT,
      tuples: BASE_TUPLES.map(
        ([id, included, permissions]) =>
          [id, id === 'collective' || id === 'malt' ? false : included, permissions] as const
      ),
    },
  ],
} as const satisfies ConnectorCatalogueHistoryV1;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.length &&
    ownKeys.every((key) => typeof key === 'string' && keys.includes(key))
  );
}

function capturedHistory(
  raw: unknown,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): ConnectorCatalogueHistoryV1 | null {
  const captured = captureSettingsReleaseData(raw);
  if (captured === null || typeof captured !== 'object' || Array.isArray(captured)) {
    return null;
  }
  const root = captured as Record<string, unknown>;
  if (
    !exactKeys(root, ['schema', 'version', 'catalogues']) ||
    root.schema !== 'missionpulse.connector-catalogue-history' ||
    root.version !== 1 ||
    !Array.isArray(root.catalogues) ||
    (!allowEmpty && root.catalogues.length === 0)
  ) {
    return null;
  }
  return root as unknown as ConnectorCatalogueHistoryV1;
}

export async function validateConnectorCatalogueHistory(raw: unknown): Promise<boolean> {
  const history = capturedHistory(raw);
  if (!history) {
    return false;
  }
  const fingerprints = new Set<string>();
  const serializedTuples = new Set<string>();
  let canonicalIds: string[] | null = null;
  for (const entry of history.catalogues) {
    if (
      !exactKeys(entry as unknown as Record<string, unknown>, ['catalogFingerprint', 'tuples']) ||
      !/^[0-9a-f]{64}$/.test(entry.catalogFingerprint) ||
      fingerprints.has(entry.catalogFingerprint) ||
      !Array.isArray(entry.tuples) ||
      entry.tuples.length === 0
    ) {
      return false;
    }
    fingerprints.add(entry.catalogFingerprint);
    const ids: string[] = [];
    for (const tuple of entry.tuples) {
      if (!Array.isArray(tuple) || tuple.length !== 3) {
        return false;
      }
      const [id, included, permissions] = tuple;
      if (
        typeof id !== 'string' ||
        id.length === 0 ||
        ids.includes(id) ||
        typeof included !== 'boolean' ||
        !Array.isArray(permissions) ||
        permissions.some((permission) => typeof permission !== 'string') ||
        new Set(permissions).size !== permissions.length ||
        permissions.some((permission, index) => index > 0 && permissions[index - 1] >= permission)
      ) {
        return false;
      }
      ids.push(id);
    }
    if (ids.some((id, index) => index > 0 && ids[index - 1] >= id)) {
      return false;
    }
    if (canonicalIds === null) {
      canonicalIds = ids;
    } else if (JSON.stringify(ids) !== JSON.stringify(canonicalIds)) {
      return false;
    }
    const tuplesJson = JSON.stringify(entry.tuples);
    if (serializedTuples.has(tuplesJson)) {
      return false;
    }
    serializedTuples.add(tuplesJson);
    if ((await connectorCatalogFingerprint(entry.tuples)) !== entry.catalogFingerprint) {
      return false;
    }
  }
  return true;
}

export function connectorCatalogueForFingerprint(
  history: ConnectorCatalogueHistoryV1,
  fingerprint: string
): ConnectorCatalogueHistoryV1['catalogues'][number] | null {
  const entry = history.catalogues.find(
    (candidate) => candidate.catalogFingerprint === fingerprint
  );
  return entry ? structuredClone(entry) : null;
}

function jcs(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => jcs(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${jcs(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('Catalogue history is not JCS data.');
}

export function verifyAppendOnlyConnectorCatalogueHistory(
  predecessorRaw: unknown,
  candidateRaw: unknown
): boolean {
  const predecessor = capturedHistory(predecessorRaw, { allowEmpty: true });
  const candidate = capturedHistory(candidateRaw);
  if (!predecessor || !candidate || candidate.catalogues.length < predecessor.catalogues.length) {
    return false;
  }
  return predecessor.catalogues.every(
    (entry, index) => jcs(entry) === jcs(candidate.catalogues[index])
  );
}

export function recognizedConnectorIdsFromHistory(history: ConnectorCatalogueHistoryV1): string[] {
  const ids = new Set<string>();
  for (const entry of history.catalogues) {
    for (const [id] of entry.tuples) {
      ids.add(id);
    }
  }
  return [...ids];
}
