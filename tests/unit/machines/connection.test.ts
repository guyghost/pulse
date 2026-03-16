import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createActor } from 'xstate';

// Mock the connection monitor module before importing the machine
vi.mock('../../../src/lib/shell/utils/connection-monitor', () => ({
  subscribeToConnection: vi.fn(() => vi.fn()),
}));

import { connectionMachine } from '../../../src/machines/connection.machine';

describe('connection machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in unknown state', () => {
    const actor = createActor(connectionMachine).start();
    expect(actor.getSnapshot().value).toBe('unknown');
    expect(actor.getSnapshot().context.status).toBe('unknown');
    expect(actor.getSnapshot().context.lastOnlineTime).toBeNull();
    expect(actor.getSnapshot().context.lastOfflineTime).toBeNull();
    actor.stop();
  });

  it('transitions unknown → online on CONNECTION_RESTORED', () => {
    const actor = createActor(connectionMachine).start();
    actor.send({
      type: 'CONNECTION_RESTORED',
      info: { status: 'online', downlink: 10, rtt: 50, effectiveType: '4g' },
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('online');
    expect(snapshot.context.status).toBe('online');
    expect(snapshot.context.lastOnlineTime).toBeTypeOf('number');
    expect(snapshot.context.downlink).toBe(10);
    expect(snapshot.context.rtt).toBe(50);
    expect(snapshot.context.effectiveType).toBe('4g');
    actor.stop();
  });

  it('transitions unknown → offline on CONNECTION_LOST', () => {
    const actor = createActor(connectionMachine).start();
    actor.send({ type: 'CONNECTION_LOST' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('offline');
    expect(snapshot.context.status).toBe('offline');
    expect(snapshot.context.lastOfflineTime).toBeTypeOf('number');
    actor.stop();
  });

  it('transitions unknown → slow on SPEED_DETECTED', () => {
    const actor = createActor(connectionMachine).start();
    actor.send({
      type: 'SPEED_DETECTED',
      info: { status: 'slow', downlink: 0.5, rtt: 800, effectiveType: '2g' },
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('slow');
    expect(snapshot.context.status).toBe('slow');
    expect(snapshot.context.downlink).toBe(0.5);
    expect(snapshot.context.rtt).toBe(800);
    expect(snapshot.context.effectiveType).toBe('2g');
    actor.stop();
  });

  it('transitions online → offline on CONNECTION_LOST', () => {
    const actor = createActor(connectionMachine).start();
    actor.send({
      type: 'CONNECTION_RESTORED',
      info: { status: 'online' },
    });
    expect(actor.getSnapshot().value).toBe('online');

    actor.send({ type: 'CONNECTION_LOST' });
    expect(actor.getSnapshot().value).toBe('offline');
    expect(actor.getSnapshot().context.status).toBe('offline');
    actor.stop();
  });

  it('transitions offline → reconnecting on CONNECTION_RESTORED', () => {
    const actor = createActor(connectionMachine).start();
    actor.send({ type: 'CONNECTION_LOST' });
    expect(actor.getSnapshot().value).toBe('offline');

    actor.send({
      type: 'CONNECTION_RESTORED',
      info: { status: 'online', downlink: 10, rtt: 50, effectiveType: '4g' },
    });
    expect(actor.getSnapshot().value).toBe('reconnecting');
    actor.stop();
  });

  it('transitions reconnecting → online after 500ms delay', () => {
    const actor = createActor(connectionMachine).start();
    // Go to offline first
    actor.send({ type: 'CONNECTION_LOST' });
    expect(actor.getSnapshot().value).toBe('offline');

    // Go to reconnecting
    actor.send({
      type: 'CONNECTION_RESTORED',
      info: { status: 'online' },
    });
    expect(actor.getSnapshot().value).toBe('reconnecting');

    // Advance timers by 500ms
    vi.advanceTimersByTime(500);
    expect(actor.getSnapshot().value).toBe('online');
    actor.stop();
  });

  it('transitions reconnecting → offline on CONNECTION_LOST during reconnecting', () => {
    const actor = createActor(connectionMachine).start();
    // Go to offline then reconnecting
    actor.send({ type: 'CONNECTION_LOST' });
    actor.send({
      type: 'CONNECTION_RESTORED',
      info: { status: 'online' },
    });
    expect(actor.getSnapshot().value).toBe('reconnecting');

    // Lose connection during reconnecting
    actor.send({ type: 'CONNECTION_LOST' });
    expect(actor.getSnapshot().value).toBe('offline');
    actor.stop();
  });

  it('updates context with connection info on CONNECTION_RESTORED', () => {
    const actor = createActor(connectionMachine).start();
    const info = { status: 'online' as const, downlink: 25, rtt: 30, effectiveType: '4g' as const };
    actor.send({ type: 'CONNECTION_RESTORED', info });

    const ctx = actor.getSnapshot().context;
    expect(ctx.status).toBe('online');
    expect(ctx.lastOnlineTime).toBeTypeOf('number');
    expect(ctx.downlink).toBe(25);
    expect(ctx.rtt).toBe(30);
    expect(ctx.effectiveType).toBe('4g');
    actor.stop();
  });

  it('updates context with connection info on SPEED_DETECTED', () => {
    const actor = createActor(connectionMachine).start();
    const info = { status: 'slow' as const, downlink: 0.3, rtt: 1000, effectiveType: 'slow-2g' as const };
    actor.send({ type: 'SPEED_DETECTED', info });

    const ctx = actor.getSnapshot().context;
    expect(ctx.status).toBe('slow');
    expect(ctx.downlink).toBe(0.3);
    expect(ctx.rtt).toBe(1000);
    expect(ctx.effectiveType).toBe('slow-2g');
    actor.stop();
  });

  it('updates lastOfflineTime on CONNECTION_LOST', () => {
    const now = Date.now();
    const actor = createActor(connectionMachine).start();
    actor.send({ type: 'CONNECTION_LOST' });

    const ctx = actor.getSnapshot().context;
    expect(ctx.lastOfflineTime).toBeTypeOf('number');
    expect(ctx.lastOfflineTime!).toBeGreaterThanOrEqual(now);
    actor.stop();
  });
});
