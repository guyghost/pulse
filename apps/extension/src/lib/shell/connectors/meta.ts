import { INCLUDED_CONNECTOR_IDS } from './build-config';

export type ConnectorId = 'free-work' | 'lehibou' | 'hiway' | 'collective' | 'cherry-pick' | 'malt';

/**
 * Host permission patterns owned by each connector. Used by vite.config.ts
 * to filter manifest.host_permissions at build time, and by verify-manifest
 * to enforce least-privilege coverage. Single source of truth.
 */
export interface ConnectorMeta {
  id: ConnectorId;
  name: string;
  icon: string;
  url: string;
  hostPermissions: readonly string[];
}

/**
 * Full catalog — the ground truth of connectors known to the codebase.
 * Filtering against the build-time config happens in getConnectorsMeta().
 */
const CATALOG: readonly ConnectorMeta[] = [
  {
    id: 'free-work',
    name: 'Free-Work',
    icon: 'https://www.google.com/s2/favicons?domain=free-work.com&sz=32',
    url: 'https://www.free-work.com',
    hostPermissions: ['https://www.free-work.com/*'],
  },
  {
    id: 'lehibou',
    name: 'LeHibou',
    icon: 'https://www.google.com/s2/favicons?domain=lehibou.com&sz=32',
    url: 'https://www.lehibou.com',
    hostPermissions: ['https://*.lehibou.com/*'],
  },
  {
    id: 'hiway',
    name: 'Hiway',
    icon: 'https://www.google.com/s2/favicons?domain=hiway-missions.fr&sz=32',
    url: 'https://hiway-missions.fr',
    // Hiway fetches missions from a Supabase REST endpoint; that host is
    // Hiway-owned infra and must be dropped when Hiway is excluded.
    hostPermissions: ['https://hiway-missions.fr/*', 'https://jhgjtlkfewuiiofxfrvh.supabase.co/*'],
  },
  {
    id: 'collective',
    name: 'Collective',
    icon: 'https://www.google.com/s2/favicons?domain=collective.work&sz=32',
    url: 'https://app.collective.work/',
    hostPermissions: ['https://*.collective.work/*'],
  },
  {
    id: 'cherry-pick',
    name: 'Cherry Pick',
    icon: 'https://www.google.com/s2/favicons?domain=cherry-pick.io&sz=32',
    url: 'https://www.cherry-pick.io',
    hostPermissions: ['https://app.cherry-pick.io/*'],
  },
  {
    id: 'malt',
    name: 'Malt',
    icon: 'https://www.google.com/s2/favicons?domain=malt.fr&sz=32',
    url: 'https://www.malt.fr',
    hostPermissions: ['https://*.malt.fr/*', 'https://*.malt.io/*'],
  },
] as const;

export const ALL_CONNECTOR_IDS: readonly ConnectorId[] = CATALOG.map((c) => c.id);

/**
 * Pure filter: keep only catalog entries whose id is in `includedIds`.
 * Preserves CATALOG ordering. Exported so unit tests can drive filtering
 * with custom inputs without touching the build-time constant.
 */
export function filterConnectorsByIncluded(
  catalog: readonly ConnectorMeta[],
  includedIds: readonly ConnectorId[]
): ConnectorMeta[] {
  const included = new Set(includedIds);
  return catalog.filter((c) => included.has(c.id));
}

/**
 * Returns the connectors shipped in this build. Filtered against
 * INCLUDED_CONNECTOR_IDS (resolved at build time from connectors.config.json
 * + CONNECTORS_INCLUDE/EXCLUDE env vars). In dev and test, falls back to the
 * full catalog.
 */
export function getConnectorsMeta(): ConnectorMeta[] {
  return filterConnectorsByIncluded(CATALOG, INCLUDED_CONNECTOR_IDS);
}

/** Full catalog — exported for build-time scripts (vite.config, verify-manifest). */
export function getAllConnectorsMeta(): readonly ConnectorMeta[] {
  return CATALOG;
}
