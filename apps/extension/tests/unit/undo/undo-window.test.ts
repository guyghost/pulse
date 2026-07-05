import { describe, it, expect } from 'vitest';
import {
  createUndoState,
  reduceUndoWindow,
  isPending,
  getPending,
  DEFAULT_UNDO_WINDOW_MS,
  type UndoState,
  type UndoEvent,
} from '../../../src/lib/core/undo/undo-window';

const NOW = 1_000_000;
const DURATION = DEFAULT_UNDO_WINDOW_MS; // 5000
const DEADLINE = NOW + DURATION;

type Snap = { label: string };

function snap(label: string): Snap {
  return { label };
}

describe('reduceUndoWindow — REQUEST', () => {
  it('transitions idle → pending-undo and emits start-timer with deterministic deadline (I4)', () => {
    const prev = createUndoState<Snap>();
    const { state, effect } = reduceUndoWindow(prev, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'm1',
      snapshot: snap('prev'),
      requestedAt: NOW,
      durationMs: DURATION,
    });
    expect(isPending(state, 'm1')).toBe(true);
    expect(effect).toEqual({
      kind: 'start-timer',
      targetId: 'm1',
      deadline: DEADLINE,
      durationMs: DURATION,
    });
    const entry = getPending(state, 'm1');
    expect(entry?.deadline).toBe(DEADLINE);
    expect(entry?.snapshot).toEqual(snap('prev'));
  });

  it('re-arming a pending target replaces snapshot and re-emits start-timer (I1)', () => {
    const { state: s1 } = reduceUndoWindow(createUndoState<Snap>(), {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'm1',
      snapshot: snap('a'),
      requestedAt: NOW,
      durationMs: DURATION,
    });
    const { state, effect } = reduceUndoWindow(s1, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'm1',
      snapshot: snap('b'),
      requestedAt: NOW + 100,
      durationMs: DURATION,
    });
    expect(getPending(state, 'm1')?.snapshot).toEqual(snap('b'));
    expect(getPending(state, 'm1')?.deadline).toBe(NOW + 100 + DURATION);
    expect(effect.kind).toBe('start-timer');
  });

  it('REQUEST only ever emits start-timer — never commit (I2)', () => {
    const { effect } = reduceUndoWindow(createUndoState<Snap>(), {
      type: 'REQUEST',
      kind: 'delete-view',
      targetId: 'v1',
      snapshot: snap('prev'),
      requestedAt: NOW,
      durationMs: DURATION,
    });
    expect(effect.kind).toBe('start-timer');
  });

  it('rejects a REQUEST whose kind conflicts with a pending entry (I1)', () => {
    const { state: s1 } = reduceUndoWindow(createUndoState<Snap>(), {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'm1',
      snapshot: snap('a'),
      requestedAt: NOW,
      durationMs: DURATION,
    });
    const { state, effect } = reduceUndoWindow(s1, {
      type: 'REQUEST',
      kind: 'delete-view',
      targetId: 'm1',
      snapshot: snap('b'),
      requestedAt: NOW,
      durationMs: DURATION,
    });
    expect(effect.kind).toBe('none');
    // Original pending entry is untouched.
    expect(getPending(state, 'm1')?.kind).toBe('hide');
    expect(getPending(state, 'm1')?.snapshot).toEqual(snap('a'));
  });
});

describe('reduceUndoWindow — UNDO', () => {
  it('restores the exact immutable snapshot captured at REQUEST (I3) and clears pending', () => {
    const captured = snap('prev');
    const { state: s1 } = reduceUndoWindow(createUndoState<Snap>(), {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'm1',
      snapshot: captured,
      requestedAt: NOW,
      durationMs: DURATION,
    });
    const { state, effect } = reduceUndoWindow(s1, { type: 'UNDO', targetId: 'm1' });
    expect(isPending(state, 'm1')).toBe(false);
    expect(effect).toEqual({ kind: 'restore', targetId: 'm1', snapshot: captured });
    // original snapshot object identity preserved (immutability)
    expect((effect as { snapshot: Snap }).snapshot).toBe(captured);
  });

  it('UNDO for an unknown target is a no-op', () => {
    const { state, effect } = reduceUndoWindow(createUndoState<Snap>(), {
      type: 'UNDO',
      targetId: 'nope',
    });
    expect(effect.kind).toBe('none');
    expect(state.pending.size).toBe(0);
  });
});

describe('reduceUndoWindow — TIMEOUT / DISMISS', () => {
  it('TIMEOUT commits the snapshot and clears pending (terminal)', () => {
    const { state: s1 } = reduceUndoWindow(createUndoState<Snap>(), {
      type: 'REQUEST',
      kind: 'delete-view',
      targetId: 'v1',
      snapshot: snap('prev'),
      requestedAt: NOW,
      durationMs: DURATION,
    });
    const { state, effect } = reduceUndoWindow(s1, { type: 'TIMEOUT', targetId: 'v1' });
    expect(isPending(state, 'v1')).toBe(false);
    expect(effect).toEqual({ kind: 'commit', targetId: 'v1', snapshot: snap('prev') });
  });

  it('DISMISS is not an event — toast close is cosmetic (timer is sole commit trigger)', () => {
    // Compile-time guard: DISMISS was removed from UndoEvent. If it is re-added,
    // this assignment becomes a type error, forcing an update here. The toast ×
    // and auto-dismiss never commit early by design (see model doc, decision D1).
    const noDismiss: 'DISMISS' extends UndoEvent<Snap>['type'] ? true : false = false;
    expect(noDismiss).toBe(false);
  });

  it('TIMEOUT for an unknown target is a no-op', () => {
    const { effect } = reduceUndoWindow(createUndoState<Snap>(), {
      type: 'TIMEOUT',
      targetId: 'nope',
    });
    expect(effect.kind).toBe('none');
  });
});

function reduceUndoState(): UndoState<Snap> {
  return reduceUndoWindow(createUndoState<Snap>(), {
    type: 'REQUEST',
    kind: 'delete-view',
    targetId: 'v1',
    snapshot: snap('prev'),
    requestedAt: NOW,
    durationMs: DURATION,
  }).state;
}

describe('reduceUndoWindow — EXPIRE_ALL (safety net)', () => {
  it('commits only entries whose deadline <= now (I6) and never expires an open window early', () => {
    // Two entries: one expired (deadline in the past), one still open.
    let state = createUndoState<Snap>();
    state = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'expired',
      snapshot: snap('e'),
      requestedAt: NOW - 10_000,
      durationMs: 5_000, // deadline = NOW - 5000 → in the past relative to NOW
    }).state;
    state = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'open',
      snapshot: snap('o'),
      requestedAt: NOW,
      durationMs: 5_000, // deadline = NOW + 5000 → still open
    }).state;

    const { state: next, effect } = reduceUndoWindow(state, { type: 'EXPIRE_ALL', now: NOW });
    expect(isPending(next, 'open')).toBe(true); // untouched
    expect(isPending(next, 'expired')).toBe(false);
    expect(effect.kind).toBe('commit-all');
    expect(effect).toMatchObject({
      kind: 'commit-all',
      entries: [{ targetId: 'expired' }],
    });
  });

  it('EXPIRE_ALL lists EVERY expired target in commit-all — none dropped silently', () => {
    let state = createUndoState<Snap>();
    state = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'e1',
      snapshot: snap('e1'),
      requestedAt: NOW - 10_000,
      durationMs: 5_000, // deadline in the past
    }).state;
    state = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'e2',
      snapshot: snap('e2'),
      requestedAt: NOW - 9_000,
      durationMs: 5_000, // deadline in the past
    }).state;
    state = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'open',
      snapshot: snap('o'),
      requestedAt: NOW,
      durationMs: 5_000, // still open
    }).state;

    const { state: next, effect } = reduceUndoWindow(state, { type: 'EXPIRE_ALL', now: NOW });
    expect(isPending(next, 'open')).toBe(true);
    expect(isPending(next, 'e1')).toBe(false);
    expect(isPending(next, 'e2')).toBe(false);
    expect(effect).toMatchObject({
      kind: 'commit-all',
      entries: [{ targetId: 'e1' }, { targetId: 'e2' }],
    });
  });

  it('emits none when nothing is expirable', () => {
    let state = createUndoState<Snap>();
    state = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'open',
      snapshot: snap('o'),
      requestedAt: NOW,
      durationMs: 5_000,
    }).state;
    const { effect } = reduceUndoWindow(state, { type: 'EXPIRE_ALL', now: NOW });
    expect(effect.kind).toBe('none');
  });
});

describe('reduceUndoWindow — invariants', () => {
  it('I1: at most one pending entry per targetId (same kind re-arms, does not duplicate)', () => {
    let state = createUndoState<Snap>();
    state = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'm1',
      snapshot: snap('a'),
      requestedAt: NOW,
      durationMs: DURATION,
    }).state;
    state = reduceUndoWindow(state, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'm1',
      snapshot: snap('b'),
      requestedAt: NOW + 1,
      durationMs: DURATION,
    }).state;
    expect(state.pending.size).toBe(1);
    expect(getPending(state, 'm1')?.snapshot).toEqual(snap('b'));
  });

  it('I4: deadline is exactly requestedAt + durationMs regardless of input', () => {
    const cases = [
      { requestedAt: 0, durationMs: 5_000 },
      { requestedAt: 1_000, durationMs: 7_500 },
      { requestedAt: 999_999, durationMs: 0 },
    ];
    for (const c of cases) {
      const { state } = reduceUndoWindow(createUndoState<Snap>(), {
        type: 'REQUEST',
        kind: 'hide',
        targetId: 'x',
        snapshot: snap('s'),
        requestedAt: c.requestedAt,
        durationMs: c.durationMs,
      });
      expect(getPending(state, 'x')?.deadline).toBe(c.requestedAt + c.durationMs);
    }
  });

  it('is pure: reducer does not mutate the previous state map', () => {
    const prev = createUndoState<Snap>();
    const { state } = reduceUndoWindow(prev, {
      type: 'REQUEST',
      kind: 'hide',
      targetId: 'm1',
      snapshot: snap('s'),
      requestedAt: NOW,
      durationMs: DURATION,
    });
    expect(prev.pending.size).toBe(0); // unchanged
    expect(state.pending.size).toBe(1);
    expect(state.pending).not.toBe(prev.pending);
  });
});
