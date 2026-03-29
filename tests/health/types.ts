/**
 * Health Check Types
 *
 * Type definitions for the connector health check system.
 */

export type HealthCheckStatus = 'ok' | 'failed' | 'timeout' | 'skipped';

export interface HealthCheckResult {
  /** Connector identifier (e.g., 'free-work', 'lehibou') */
  connectorId: string;
  /** Human-readable connector name */
  connectorName: string;
  /** Result status */
  status: HealthCheckStatus;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** ISO timestamp when check was performed */
  timestamp: string;
  /** Error message if failed */
  error?: string;
  /** Error details for debugging */
  errorDetails?: Record<string, unknown>;
  /** Path to screenshot if captured (for scraping connectors) */
  screenshotPath?: string;
  /** Number of missions found (if applicable) */
  missionsFound?: number;
  /** Additional check-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface HealthCheckReport {
  /** ISO timestamp when report was generated */
  timestamp: string;
  /** Total duration of all checks in milliseconds */
  durationMs: number;
  /** Individual connector results */
  results: HealthCheckResult[];
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** Environment info */
  environment: {
    node: string;
    platform: string;
    ci: boolean;
  };
}

export interface ConnectorConfig {
  /** Whether this connector is enabled for health checks */
  enabled: boolean;
  /** Timeout in milliseconds */
  timeout: number;
  /** Optional: skip reason if disabled */
  skipReason?: string;
}

export interface HealthCheckConfig {
  connectors: Record<string, ConnectorConfig>;
  screenshots: {
    enabled: boolean;
    directory: string;
  };
  /** Fail fast: stop on first failure */
  failFast: boolean;
  /** Parallel execution */
  parallel: boolean;
}

export interface GitHubIssuePayload {
  title: string;
  body: string;
  labels: string[];
  assignees?: string[];
}

/**
 * Badge colors for shields.io
 */
export type BadgeColor =
  | 'brightgreen'
  | 'green'
  | 'yellowgreen'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'blue'
  | 'lightgrey';

export interface BadgeConfig {
  label: string;
  message: string;
  color: BadgeColor;
}
