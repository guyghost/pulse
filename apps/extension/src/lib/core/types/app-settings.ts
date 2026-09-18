/**
 * Application settings shared across core and shell.
 * Pure domain type: no I/O, no runtime validation.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface AppSettings {
  scanIntervalMinutes: number;
  enabledConnectors: string[];
  notifications: boolean;
  autoScan: boolean;
  maxSemanticPerScan: number;
  notificationScoreThreshold: number;
  respectRateLimits: boolean;
  customDelayMs: number;
  theme: ThemePreference;
  /** Master switch for the Jev classification service (AI Gateway). */
  classificationEnabled: boolean;
  /** Maximum missions classified per scan (cost budget). */
  maxClassificationPerScan: number;
  /** Minimum model confidence in [0, 1] for a classification to be kept. */
  classificationConfidenceThreshold: number;
}
