/**
 * Surveillance de l'état de la connexion réseau
 * Utilise navigator.onLine et l'API Network Information si disponible
 *
 * Compatible Service Worker (pas de window/document).
 */

/** Détecte si on est dans un contexte Service Worker (pas de window) */
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
 * Récupère les informations de connexion actuelles
 * Combine navigator.onLine et Network Information API
 */
function getConnectionInfo(): ConnectionInfo {
  // Service worker: navigator.onLine est disponible mais pas window/document
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!online) {
    return { status: 'offline' };
  }

  // Network Information API (experimental mais bien supportée)
  const connection =
    typeof navigator !== 'undefined'
      ? (navigator as NavigatorWithConnection).connection
      : undefined;

  if (connection) {
    const effectiveType = connection.effectiveType as ConnectionInfo['effectiveType'];
    const downlink = typeof connection.downlink === 'number' ? connection.downlink : undefined;
    const rtt = typeof connection.rtt === 'number' ? connection.rtt : undefined;

    // Considérer comme 'slow' si 2g, slow-2g, ou RTT élevé
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
 * Initialise les écouteurs d'événements (appelé une seule fois)
 * No-op dans le Service Worker (pas de window).
 */
let isInitialized = false;
function initListeners(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Service Worker n'a pas accès à window — skip les event listeners
  if (isServiceWorker) return;

  window.addEventListener('online', notifyListeners);
  window.addEventListener('offline', notifyListeners);

  // Écouter les changements de Network Information API
  const connection = (navigator as any).connection;
  if (connection) {
    connection.addEventListener('change', notifyListeners);
  }
}

/**
 * S'abonne aux changements d'état de connexion
 * @param callback Fonction appelée à chaque changement
 * @returns Fonction de désabonnement
 */
export function subscribeToConnection(callback: ConnectionCallback): () => void {
  initListeners();
  listeners.add(callback);

  // Notifier immédiatement avec l'état actuel
  callback(currentInfo);

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Récupère l'état actuel de la connexion sans s'abonner
 */
export function getCurrentConnection(): ConnectionInfo {
  currentInfo = getConnectionInfo();
  return currentInfo;
}

/**
 * Vérifie si le navigateur est en ligne
 * Fonctionne dans le Service Worker (utilise navigator, pas window)
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Vérifie si la connexion est lente
 */
export function isSlowConnection(): boolean {
  const info = getCurrentConnection();
  return info.status === 'slow';
}

/**
 * Attend que la connexion soit restaurée
 * @param timeoutMs Timeout en ms (défaut: 30s)
 * @returns Promise qui résout quand online, rejecte si timeout
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
