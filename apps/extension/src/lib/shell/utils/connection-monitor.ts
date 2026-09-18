/**
 * Network connection state monitoring
 * Uses navigator.onLine and the Network Information API when available
 *
 * Compatible Service Worker (pas de window/document).
 */

/** Detects whether we're in a Service Worker context (no window) */
const isServiceWorker = typeof window === 'undefined';

export type ConnectionStatus = 'online' | 'offline' | 'slow' | 'unknown';

export interface ConnectionInfo {
  status: ConnectionStatus;
  downlink?: number; // Mbps
  rtt?: number; // ms
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
}

/** Network Information API (experimental, Chrome-only) */
interface NetworkInformation extends EventTarget {
  readonly effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  readonly downlink?: number;
  readonly rtt?: number;
}

interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformation;
}

type ConnectionCallback = (info: ConnectionInfo) => void;

const listeners = new Set<ConnectionCallback>();
let currentInfo: ConnectionInfo = getConnectionInfo();

/**
 * Retrieves the current connection information
 * Combines navigator.onLine and the Network Information API
 */
function getConnectionInfo(): ConnectionInfo {
  // Service worker: navigator.onLine est disponible mais pas window/document
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!online) {
    return { status: 'offline' };
  }

  // Network Information API (experimental but well supported)
  const connection =
    typeof navigator !== 'undefined'
      ? (navigator as NavigatorWithConnection).connection
      : undefined;

  if (connection) {
    const effectiveType = connection.effectiveType;
    const downlink = typeof connection.downlink === 'number' ? connection.downlink : undefined;
    const rtt = typeof connection.rtt === 'number' ? connection.rtt : undefined;

    // Consider 'slow' when 2g, slow-2g, or high RTT
    const isSlow = effectiveType === '2g' || effectiveType === 'slow-2g' || (rtt && rtt > 500);

    return {
      status: isSlow ? 'slow' : 'online',
      downlink,
      rtt,
      effectiveType,
    };
  }

  // Fallback si Network Information API non disponible
  return { status: 'online' };
}

/**
 * Notifie tous les listeners d'un changement de connexion
 */
function notifyListeners(): void {
  currentInfo = getConnectionInfo();
  listeners.forEach((cb) => cb(currentInfo));
}

/**
 * Initializes event listeners (called once)
 * No-op in the Service Worker (no window).
 */
let isInitialized = false;
function initListeners(): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  // Service Worker has no access to window — skip event listeners
  if (isServiceWorker) {
    return;
  }

  window.addEventListener('online', notifyListeners);
  window.addEventListener('offline', notifyListeners);

  // Listen to Network Information API changes
  const connection = (
    navigator as unknown as {
      connection?: EventTarget & { effectiveType?: string };
    }
  ).connection;
  if (connection) {
    connection.addEventListener('change', notifyListeners);
  }
}

/**
 * Subscribes to connection state changes
 * @param callback Function invoked on each change
 * @returns Unsubscribe function
 */
export function subscribeToConnection(callback: ConnectionCallback): () => void {
  initListeners();
  listeners.add(callback);

  // Notify immediately with the current state
  callback(currentInfo);

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Retrieves the current connection state without subscribing
 */
export function getCurrentConnection(): ConnectionInfo {
  currentInfo = getConnectionInfo();
  return currentInfo;
}

/**
 * Checks whether the browser is online
 * Works in the Service Worker (uses navigator, not window)
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Checks whether the connection is slow
 */
export function isSlowConnection(): boolean {
  const info = getCurrentConnection();
  return info.status === 'slow';
}

/**
 * Waits for the connection to be restored
 * @param timeoutMs Timeout in ms (default: 30s)
 * @returns Promise resolving when online, rejecting on timeout
 */
export function waitForOnline(timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isOnline()) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for connection'));
    }, timeoutMs);

    const unsubscribe = subscribeToConnection((info) => {
      if (info.status !== 'offline') {
        cleanup();
        resolve();
      }
    });

    function cleanup() {
      clearTimeout(timeout);
      unsubscribe();
    }
  });
}
