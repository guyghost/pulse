/**
 * Application settings shared across core and shell.
 * Pure domain type: no I/O, no runtime validation.
 */

export interface AppSettings {
  scanIntervalMinutes: number;
  enabledConnectors: string[];
  notifications: boolean;
  autoScan: boolean;
  maxSemanticPerScan: number;
  notificationScoreThreshold: number;
  respectRateLimits: boolean;
  customDelayMs: number;
}
