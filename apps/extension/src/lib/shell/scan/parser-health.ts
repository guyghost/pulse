/**
 * Parser health tracking for detecting anomalies in connector outputs.
 *
 * Shell layer: owns chrome.storage.local persistence and dev-only side effects
 * (console.warn). All decision logic is delegated to the pure Core function
 * `evaluateParserHealth` (see `core/connectors/parser-health-logic.ts`).
 *
 * Tracks previous results per connector to detect suspicious patterns:
 * - A connector returning 0 missions after previously returning >0
 * - Too many consecutive zero-results (possibly a broken parser)
 */

import {
  evaluateParserHealth,
  BROKEN_PARSER_THRESHOLD,
  type ConnectorHealthRecord,
  type ParserHealthStatus,
} from '../../core/connectors/parser-health-logic';

// Re-export the status type so existing importers keep compiling.
export type { ParserHealthStatus } from '../../core/connectors/parser-health-logic';

const HEALTH_STORAGE_KEY = 'parser_health';

/**
 * Load health records from storage
 */
const loadHealthRecords = async (): Promise<Map<string, ConnectorHealthRecord>> => {
  const result = await chrome.storage.local.get(HEALTH_STORAGE_KEY);
  const records = (result[HEALTH_STORAGE_KEY] as Record<string, ConnectorHealthRecord>) ?? {};
  return new Map(Object.entries(records));
};

/**
 * Save health records to storage
 */
const saveHealthRecords = async (records: Map<string, ConnectorHealthRecord>): Promise<void> => {
  const obj = Object.fromEntries(records);
  await chrome.storage.local.set({ [HEALTH_STORAGE_KEY]: obj });
};

/**
 * Record and check parser health for a connector result.
 *
 * Call this after each connector fetch to track patterns.
 *
 * @param connectorId The connector identifier
 * @param missionCount Number of missions returned by the connector
 * @param now Current timestamp (injected)
 * @returns Health status with warning if suspicious
 */
export const trackParserHealth = async (
  connectorId: string,
  missionCount: number,
  now: number
): Promise<ParserHealthStatus> => {
  const records = await loadHealthRecords();
  const existing = records.get(connectorId) ?? null;

  // Delegate decision to the pure Core function
  const { record, status } = evaluateParserHealth(connectorId, existing, missionCount, now);

  records.set(connectorId, record);

  // Persist (non-blocking, ignore errors)
  saveHealthRecords(records).catch(() => {});

  // Dev-only side effects (kept in the Shell — I/O / logging)
  if (status.warning !== undefined && import.meta.env.DEV) {
    console.warn(`[ParserHealth] ${status.warning}`);
  }

  if (record.consecutiveZeros >= BROKEN_PARSER_THRESHOLD && import.meta.env.DEV) {
    console.warn(
      `[ParserHealth] ${connectorId} has returned 0 missions for ${record.consecutiveZeros} consecutive scans`
    );
  }

  return status;
};

/**
 * Reset health tracking for a connector (e.g., after user acknowledges warning)
 */
export const resetParserHealth = async (connectorId: string): Promise<void> => {
  const records = await loadHealthRecords();
  records.delete(connectorId);
  await saveHealthRecords(records);
};

/**
 * Get current health status for all connectors
 */
export const getAllParserHealth = async (): Promise<ConnectorHealthRecord[]> => {
  const records = await loadHealthRecords();
  return Array.from(records.values());
};
