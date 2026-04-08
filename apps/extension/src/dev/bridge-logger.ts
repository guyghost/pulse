export type LogEntry = {
  direction: '→' | '←';
  type: string;
  summary: string;
  time: string;
};

const logs: LogEntry[] = [];
const maxLogs = 100;

function formatTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

function summarizePayload(payload: unknown): string {
  if (payload === undefined || payload === null) {
    return '';
  }
  if (Array.isArray(payload)) {
    return `[${payload.length} items]`;
  }
  if (typeof payload === 'object') {
    const keys = Object.keys(payload);
    if (keys.length <= 3) {
      return JSON.stringify(payload);
    }
    return `{${keys.slice(0, 3).join(', ')}...}`;
  }
  return String(payload);
}

export function logBridgeMessage(direction: '→' | '←', type: string, payload?: unknown): void {
  const entry: LogEntry = {
    direction,
    type,
    summary: summarizePayload(payload),
    time: formatTime(),
  };
  logs.push(entry);
  if (logs.length > maxLogs) {
    logs.shift();
  }

  console.log(`[Bridge] ${direction} ${type} ${entry.summary}  ${entry.time}`);

  window.dispatchEvent(new CustomEvent('dev:bridge-log', { detail: entry }));
}

export function installBridgeLogger(): void {
  console.log('[Dev] Bridge logger installed');
}

export function getBridgeLogs(): LogEntry[] {
  return [...logs];
}
