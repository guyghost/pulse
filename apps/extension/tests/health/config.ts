/**
 * Health Check Configuration
 *
 * Loads and validates health check configuration from environment
 * and optional config file.
 */

/// <reference types="node" />

import type { HealthCheckConfig, ConnectorConfig } from './types';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_CONFIG: HealthCheckConfig = {
  connectors: {
    'free-work': { enabled: true, timeout: 30000 },
    lehibou: { enabled: true, timeout: 60000 },
    hiway: { enabled: true, timeout: 60000 },
    collective: { enabled: true, timeout: 60000 },
    'cherry-pick': { enabled: true, timeout: 60000 },
  },
  screenshots: {
    enabled: true,
    directory: 'tests/health/screenshots',
  },
  failFast: false,
  parallel: true,
};

/**
 * Load configuration from file if it exists, otherwise use defaults.
 */
export function loadConfig(): HealthCheckConfig {
  const configPath = join(process.cwd(), 'health-check.config.json');

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const fileConfig = JSON.parse(raw) as Partial<HealthCheckConfig>;

      // Merge with defaults
      return {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        connectors: {
          ...DEFAULT_CONFIG.connectors,
          ...fileConfig.connectors,
        },
        screenshots: {
          ...DEFAULT_CONFIG.screenshots,
          ...fileConfig.screenshots,
        },
      };
    } catch (error) {
      console.warn('Failed to load health-check.config.json, using defaults:', error);
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * Get timeout from environment or config.
 */
export function getTimeout(config: HealthCheckConfig, connectorId: string): number {
  const envTimeout = process.env.HEALTH_CHECK_TIMEOUT;
  if (envTimeout) {
    const parsed = parseInt(envTimeout, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  return config.connectors[connectorId]?.timeout ?? 30000;
}

/**
 * Check if a connector is enabled.
 */
export function isConnectorEnabled(config: HealthCheckConfig, connectorId: string): boolean {
  return config.connectors[connectorId]?.enabled ?? true;
}

/**
 * Get skip reason for a disabled connector.
 */
export function getSkipReason(config: HealthCheckConfig, connectorId: string): string | undefined {
  return config.connectors[connectorId]?.skipReason;
}

/**
 * Get connector configuration.
 */
export function getConnectorConfig(
  config: HealthCheckConfig,
  connectorId: string
): ConnectorConfig {
  return config.connectors[connectorId] ?? { enabled: true, timeout: 30000 };
}

/**
 * Check if running in CI environment.
 */
export function isCI(): boolean {
  return !!(process.env.CI || process.env.GITHUB_ACTIONS);
}

/**
 * Get screenshots directory path.
 */
export function getScreenshotsDir(config: HealthCheckConfig): string {
  return join(process.cwd(), config.screenshots.directory);
}
