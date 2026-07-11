/**
 * Build-time connector accessor.
 *
 * `INCLUDED_CONNECTOR_IDS` is the resolved list of connector IDs shipped in
 * this build (see scripts/resolve-connectors.mjs + connectors.config.json).
 * Vite injects it as the `__PULSE_INCLUDED_CONNECTORS__` compile-time
 * constant (see vite.config.ts). In dev and vitest the define is absent, so
 * `typeof` guards against ReferenceError and we fall back to the full
 * catalog — i.e. all connectors are shipped/visible unless the build says
 * otherwise.
 *
 * Runtime filtering (getConnectorsMeta, CONNECTOR_REGISTRY,
 * DEFAULT_SETTINGS.enabledConnectors) reads from this module so the build
 * decision stays the single source of truth.
 *
 * See: apps/extension/src/models/connector-build-config.model.md
 */
import type { ConnectorId } from './meta';

/**
 * Full catalog fallback. Duplicated here (rather than imported from meta.ts)
 * to keep this module free of runtime deps and avoid a value cycle — meta.ts
 * imports INCLUDED_CONNECTOR_IDS from here.
 */
const FALLBACK_CONNECTOR_IDS: readonly ConnectorId[] = [
  'free-work',
  'lehibou',
  'hiway',
  'collective',
  'cherry-pick',
  'malt',
];

declare const __PULSE_INCLUDED_CONNECTORS__: readonly ConnectorId[] | undefined;

export const INCLUDED_CONNECTOR_IDS: readonly ConnectorId[] =
  typeof __PULSE_INCLUDED_CONNECTORS__ === 'undefined'
    ? FALLBACK_CONNECTOR_IDS
    : __PULSE_INCLUDED_CONNECTORS__;
