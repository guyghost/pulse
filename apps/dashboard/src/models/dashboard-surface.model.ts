/**
 * M1 — Dashboard surface composition model (source of truth).
 *
 * Pure function of server data. Decides WHAT renders and in WHAT ORDER per
 * lifecycle phase, replacing the implicit `{#if setupRequired}` tangle.
 *
 * Invariants (asserted in tests/unit/models/dashboard-surface.model.test.ts):
 *  - The mission feed is always the first content section in `live_*` phases.
 *  - Hero metrics never render in `unconfigured`, `onboarding`, or `live_empty`.
 *  - The operational status banner renders only when an actionable signal exists
 *    (attention/incident), never as decorative chrome.
 *
 * FC&IS: zero I/O, zero async, fully testable without mocks.
 */

export type DashboardPhase =
  /** Account not connected and profile configuration missing — bare shell + setup. */
  | 'unconfigured'
  /** Account ok but extension not linked / no snapshot yet — guide setup. */
  | 'onboarding'
  /** Dashboard ready but no missions detected yet — feed is the starting point. */
  | 'live_empty'
  /** Dashboard ready with missions — feed is primary, chrome is secondary. */
  | 'live_populated';

export interface DashboardSurfaceInput {
  isConnected: boolean;
  configurationMissing: boolean;
  hasConnectedExtension: boolean;
  missionFeedLength: number;
}

/**
 * Derive the dashboard lifecycle phase from raw server signals.
 * Order matters: unconfigured short-circuits before the extension check.
 */
export function deriveDashboardPhase(input: DashboardSurfaceInput): DashboardPhase {
  if (input.configurationMissing || !input.isConnected) {
    return 'unconfigured';
  }
  if (!input.hasConnectedExtension) {
    return 'onboarding';
  }
  return input.missionFeedLength > 0 ? 'live_populated' : 'live_empty';
}

/** Whether hero metrics may render for this phase (always false until populated). */
export function canShowMetrics(phase: DashboardPhase): boolean {
  return phase === 'live_populated';
}

/** Whether the operational status banner may render (only actionable phases). */
export function canShowStatusBanner(phase: DashboardPhase): boolean {
  return phase === 'live_empty' || phase === 'live_populated';
}

/** Whether the slim setup checklist renders (unconfigured + onboarding only). */
export function canShowSetupChecklist(phase: DashboardPhase): boolean {
  return phase === 'unconfigured' || phase === 'onboarding';
}

/** Whether the mission feed is the primary surface (above all chrome). */
export function isFeedPrimary(phase: DashboardPhase): boolean {
  return phase === 'live_empty' || phase === 'live_populated';
}
