import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ConnectionInfo } from '../../../src/lib/shell/utils/connection-monitor';

// Capturer le callback pour simuler des événements de connexion
let connectionCallback: ((info: ConnectionInfo) => void) | null = null;

vi.mock('../../../src/lib/shell/utils/connection-monitor', () => ({
  subscribeToConnection: vi.fn((cb: (info: ConnectionInfo) => void) => {
    connectionCallback = cb;
    return vi.fn();
  }),
}));

import { createConnectionStore } from '../../../src/lib/state/connection.svelte';

describe('connection store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    connectionCallback = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in unknown state', () => {
    const store = createConnectionStore();
    // subscribeToConnection appelle immédiatement le callback — mais dans les tests,
    // le mock ne l'appelle pas automatiquement, donc le statut reste 'unknown'
    expect(store.status).toBe('unknown');
    expect(store.lastOnlineTime).toBeNull();
    expect(store.lastOfflineTime).toBeNull();
    store.destroy();
  });

  it('transitions unknown → online on online info', () => {
    const store = createConnectionStore();
    connectionCallback!({ status: 'online', downlink: 10, rtt: 50, effectiveType: '4g' });

    expect(store.status).toBe('online');
    expect(store.lastOnlineTime).toBeTypeOf('number');
    expect(store.downlink).toBe(10);
    expect(store.rtt).toBe(50);
    expect(store.effectiveType).toBe('4g');
    store.destroy();
  });

  it('transitions unknown → offline on offline info', () => {
    const store = createConnectionStore();
    connectionCallback!({ status: 'offline' });

    expect(store.status).toBe('offline');
    expect(store.lastOfflineTime).toBeTypeOf('number');
    store.destroy();
  });

  it('transitions unknown → slow on slow info', () => {
    const store = createConnectionStore();
    connectionCallback!({ status: 'slow', downlink: 0.5, rtt: 800, effectiveType: '2g' });

    expect(store.status).toBe('slow');
    expect(store.downlink).toBe(0.5);
    expect(store.rtt).toBe(800);
    expect(store.effectiveType).toBe('2g');
    store.destroy();
  });

  it('transitions online → offline on offline info', () => {
    const store = createConnectionStore();
    connectionCallback!({ status: 'online' });
    expect(store.status).toBe('online');

    connectionCallback!({ status: 'offline' });
    expect(store.status).toBe('offline');
    expect(store.lastOfflineTime).toBeTypeOf('number');
    store.destroy();
  });

  it('transitions offline → reconnecting on online info', () => {
    const store = createConnectionStore();
    connectionCallback!({ status: 'offline' });
    expect(store.status).toBe('offline');

    connectionCallback!({ status: 'online', downlink: 10, rtt: 50, effectiveType: '4g' });
    expect(store.status).toBe('reconnecting');
    store.destroy();
  });

  it('transitions reconnecting → online after 500ms delay', () => {
    const store = createConnectionStore();
    // Passer par offline d'abord
    connectionCallback!({ status: 'offline' });
    expect(store.status).toBe('offline');

    // Passer en reconnecting
    connectionCallback!({ status: 'online' });
    expect(store.status).toBe('reconnecting');

    // Avancer les timers de 500ms
    vi.advanceTimersByTime(500);
    expect(store.status).toBe('online');
    store.destroy();
  });

  it('transitions reconnecting → offline on offline info during reconnecting', () => {
    const store = createConnectionStore();
    // Passer par offline puis reconnecting
    connectionCallback!({ status: 'offline' });
    connectionCallback!({ status: 'online' });
    expect(store.status).toBe('reconnecting');

    // Perdre la connexion pendant reconnecting
    connectionCallback!({ status: 'offline' });
    expect(store.status).toBe('offline');

    // Vérifier que le timer est annulé (pas de transition vers online)
    vi.advanceTimersByTime(500);
    expect(store.status).toBe('offline');
    store.destroy();
  });

  it('updates context with connection info on online', () => {
    const store = createConnectionStore();
    const info: ConnectionInfo = { status: 'online', downlink: 25, rtt: 30, effectiveType: '4g' };
    connectionCallback!(info);

    expect(store.status).toBe('online');
    expect(store.lastOnlineTime).toBeTypeOf('number');
    expect(store.downlink).toBe(25);
    expect(store.rtt).toBe(30);
    expect(store.effectiveType).toBe('4g');
    store.destroy();
  });

  it('updates context with connection info on slow', () => {
    const store = createConnectionStore();
    const info: ConnectionInfo = { status: 'slow', downlink: 0.3, rtt: 1000, effectiveType: 'slow-2g' };
    connectionCallback!(info);

    expect(store.status).toBe('slow');
    expect(store.downlink).toBe(0.3);
    expect(store.rtt).toBe(1000);
    expect(store.effectiveType).toBe('slow-2g');
    store.destroy();
  });

  it('updates lastOfflineTime on offline info', () => {
    const now = Date.now();
    const store = createConnectionStore();
    connectionCallback!({ status: 'offline' });

    expect(store.lastOfflineTime).toBeTypeOf('number');
    expect(store.lastOfflineTime!).toBeGreaterThanOrEqual(now);
    store.destroy();
  });
});
