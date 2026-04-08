/**
 * Store réactif pour gérer l'état de connexion réseau
 * Remplace connectionMachine (XState) par des runes Svelte 5
 * États: unknown, online, offline, reconnecting, slow
 */

import {
  subscribeToConnection,
  type ConnectionInfo,
  type ConnectionStatus,
} from '$lib/shell/utils/connection-monitor';

export type ConnectionState = 'unknown' | 'online' | 'offline' | 'reconnecting' | 'slow';

export interface ConnectionStore {
  readonly status: ConnectionState;
  readonly lastOnlineTime: number | null;
  readonly lastOfflineTime: number | null;
  readonly downlink: number | undefined;
  readonly rtt: number | undefined;
  readonly effectiveType: ConnectionInfo['effectiveType'];
  destroy(): void;
}

export function createConnectionStore(): ConnectionStore {
  let status = $state<ConnectionState>('unknown');
  let lastOnlineTime = $state<number | null>(null);
  let lastOfflineTime = $state<number | null>(null);
  let downlink = $state<number | undefined>(undefined);
  let rtt = $state<number | undefined>(undefined);
  let effectiveType = $state<ConnectionInfo['effectiveType']>(undefined);

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function handleConnectionInfo(info: ConnectionInfo) {
    if (info.status === 'offline') {
      // Annuler le timer de reconnexion si on perd la connexion pendant reconnecting
      clearReconnectTimer();
      status = 'offline';
      lastOfflineTime = Date.now();
    } else if (info.status === 'slow') {
      clearReconnectTimer();
      status = 'slow';
      downlink = info.downlink;
      rtt = info.rtt;
      effectiveType = info.effectiveType;
    } else {
      // info.status === 'online' ou 'unknown'
      if (status === 'offline') {
        // Passage par l'état reconnecting avec délai de 500ms
        status = 'reconnecting';
        downlink = info.downlink;
        rtt = info.rtt;
        effectiveType = info.effectiveType;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          status = 'online';
          lastOnlineTime = Date.now();
        }, 500);
      } else {
        // Transition directe vers online (depuis unknown, slow, etc.)
        clearReconnectTimer();
        status = 'online';
        lastOnlineTime = Date.now();
        downlink = info.downlink;
        rtt = info.rtt;
        effectiveType = info.effectiveType;
      }
    }
  }

  const unsubscribe = subscribeToConnection(handleConnectionInfo);

  return {
    get status() {
      return status;
    },
    get lastOnlineTime() {
      return lastOnlineTime;
    },
    get lastOfflineTime() {
      return lastOfflineTime;
    },
    get downlink() {
      return downlink;
    },
    get rtt() {
      return rtt;
    },
    get effectiveType() {
      return effectiveType;
    },
    destroy() {
      clearReconnectTimer();
      unsubscribe();
    },
  };
}
