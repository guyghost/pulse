import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import manifest from './src/manifest.json';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';
import { resolveIncludedConnectors } from './scripts/resolve-connectors';
import { getAllConnectorsMeta, ALL_CONNECTOR_IDS } from './src/lib/shell/connectors/meta';

/**
 * Build-time connector resolution.
 *
 * In `vite build` only, reads `connectors.config.json` and the
 * CONNECTORS_INCLUDE / CONNECTORS_EXCLUDE env vars (env wins) to decide which
 * connectors the package ships. Drives two things:
 *  1. `manifest.host_permissions` is filtered to keep only patterns owned by
 *     included connectors (least-privilege).
 *  2. `__PULSE_INCLUDED_CONNECTORS__` is injected as a compile-time constant
 *     so runtime code (meta.ts, CONNECTOR_REGISTRY, DEFAULT_SETTINGS) can
 *     hide excluded connectors from the UI, scanner, and defaults.
 *
 * Dev and test skip the config-file read so the full catalog stays visible.
 *
 * See: src/models/connector-build-config.model.md
 */

/**
 * Synchronously read connectors.config.json so it can feed both the manifest
 * filter and the runtime define. Missing/invalid file → empty config (ship all).
 */
function readConnectorConfigSync(): { include?: string[]; exclude?: string[] } {
  try {
    const raw = readFileSync(resolve(__dirname, 'connectors.config.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Filter manifest host_permissions: keep a pattern if it is owned by an
 * included connector OR not owned by any connector (infra patterns like the
 * Supabase host are always retained).
 */
function filterHostPermissions(
  hostPermissions: string[],
  includedIds: readonly string[]
): string[] {
  const catalog = getAllConnectorsMeta();
  const includedSet = new Set(includedIds);
  return hostPermissions.filter((pattern) => {
    const owner = catalog.find((c) => c.hostPermissions.includes(pattern));
    if (!owner) {
      return true; // Unowned pattern (Supabase, missionpulse.app, …)
    }
    return includedSet.has(owner.id);
  });
}

export default defineConfig(({ command }) => {
  // Only the build reads connectors.config.json. Dev and test always ship
  // the full catalog so vitest assertions and `pnpm dev` stay deterministic.
  // Env vars (CONNECTORS_INCLUDE/EXCLUDE) apply in every mode, so you can
  // preview filtering in dev by exporting them.
  const isBuild = command === 'build';
  const connectorConfig = isBuild ? readConnectorConfigSync() : {};

  const connectorResolution = resolveIncludedConnectors({
    allIds: [...ALL_CONNECTOR_IDS],
    config: connectorConfig,
    env: process.env,
  });
  const INCLUDED_CONNECTOR_IDS = connectorResolution.included;

  if (connectorResolution.warnings.length > 0) {
    console.warn('[connectors]', connectorResolution.warnings.join('; '));
  }
  if (isBuild && INCLUDED_CONNECTOR_IDS.length === 0) {
    console.warn('[connectors] build ships ZERO connectors — scanner will be inert');
  }

  const filteredManifest = {
    ...manifest,
    host_permissions: isBuild
      ? filterHostPermissions(manifest.host_permissions ?? [], INCLUDED_CONNECTOR_IDS)
      : manifest.host_permissions,
  };

  return {
    plugins: [svelte(), tailwindcss(), crx({ manifest: filteredManifest })],
    define: {
      __PULSE_INCLUDED_CONNECTORS__: JSON.stringify(INCLUDED_CONNECTOR_IDS),
    },
    server: {
      host: '0.0.0.0',
      port: 5176,
      strictPort: true,
      hmr: {
        host: 'localhost',
        port: 5176,
        protocol: 'ws',
      },
    },
    test: {
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        exclude: ['tests/', 'node_modules/', 'dist/', 'src/dev/', '**/*.test.ts', '**/*.d.ts'],
      },
    },
    resolve: {
      alias: {
        $lib: resolve(__dirname, './src/lib'),
      },
      conditions: ['browser', 'import', 'module', 'default'],
    },
    build: {
      // Extension runs in Chrome only — emit modern ESNext, skip down-level transpile.
      target: 'esnext',
      modulePreload: { polyfill: false },
      chunkSizeWarningLimit: 600,
      outDir: 'dist',
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        },
      },
    },
  };
});
