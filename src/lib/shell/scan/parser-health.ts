/**
 * Parser health tracking for detecting anomalies in connector outputs.
 *
 * Tracks previous results per connector to detect suspicious patterns:
 * - A connector returning 0 missions after previously returning >0
 *
 * This helps identify when a parser may have broken due to DOM changes.
 */

interface ConnectorHealthRecord {
  connectorId: string;
  lastMissionCount: number;
  lastSuccessAt: number | null;
  consecutiveZeros: number;
}

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

export interface ParserHealthStatus {
  connectorId: string;
  missionCount: number;
  previousCount: number;
  isSuspicious: boolean;
  /** Non-null message when a suspicious pattern is detected */
  warning?: string;
}

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
  const existing = records.get(connectorId);

  const previousCount = existing?.lastMissionCount ?? 0;
  let consecutiveZeros = missionCount === 0 ? (existing?.consecutiveZeros ?? 0) + 1 : 0;

  // Detect suspicious pattern: went from >0 to 0
  const isSuspicious = previousCount > 0 && missionCount === 0;

  // Update record
  const record: ConnectorHealthRecord = {
    connectorId,
    lastMissionCount: missionCount,
    lastSuccessAt: missionCount > 0 ? now : existing?.lastSuccessAt ?? null,
    consecutiveZeros,
  };
  records.set(connectorId, record);

  // Persist (non-blocking, ignore errors)
  saveHealthRecords(records).catch(() => {});

  const status: ParserHealthStatus = {
    connectorId,
    missionCount,
    previousCount,
    isSuspicious,
  };

  if (isSuspicious) {
    status.warning = `Parser anomaly: ${connectorId} returned 0 missions after previously returning ${previousCount}`;
    if (import.meta.env.DEV) console.warn(`[ParserHealth] ${status.warning}`);
  }

  // Also warn on too many consecutive zeros (might indicate a broken parser)
  if (consecutiveZeros >= 5 && import.meta.env.DEV) {
    console.warn(
      `[ParserHealth] ${connectorId} has returned 0 missions for ${consecutiveZeros} consecutive scans`
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
