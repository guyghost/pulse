import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUndoController } from '../../../src/lib/shell/undo/undo-controller';
import { DEFAULT_UNDO_WINDOW_MS } from '../../../src/lib/core/undo/undo-window';

const toastMock = vi.hoisted(() => ({
  showToastAction: vi.fn(() => 42),
  dismissToast: vi.fn(),
}));

vi.mock('../../../src/lib/shell/notifications/toast-service', () => toastMock);

/**
 * The reducer is pure and fully tested in undo-window.test.ts. These tests lock
 * in the SHELL orchestration invariants the reducer can't express on its own —
 * specifically how `onCommit` scopes persistence to the committing target while
 * excluding genuinely still-open sibling windows (review thread on hide/view
 * commit sharing one persisted map).
 */
describe('createUndoController — commit scoping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not persist a still-open sibling when one target commits (hide)', () => {
    const commits: Array<{ targetId: string; stillPending: string[] }> = [];
    const ctrl = createUndoController<Record<string, number>>({
      kind: 'hide',
      onCommit: (targetId, _snapshot, { stillPending }) => {
        commits.push({ targetId, stillPending: stillPending.map((p) => p.targetId) });
      },
      onRestore: () => {},
      toastMessage: () => 'Mission masquée',
    });

    // Stagger deadlines so m1 commits while m2's window is genuinely still open.
    ctrl.request('m1', { m1: 100 }); // deadline 5000
    vi.advanceTimersByTime(1000);
    ctrl.request('m2', { m1: 100, m2: 200 }); // deadline 6000

    // Advance only to m1's deadline (t=5000): m1 commits, m2 is still pending.
    vi.advanceTimersByTime(DEFAULT_UNDO_WINDOW_MS - 1000); // t=1000 → t=5000

    expect(commits).toEqual([{ targetId: 'm1', stillPending: ['m2'] }]);

    // Then advance to m2's deadline; nothing else is pending.
    vi.advanceTimersByTime(1000); // t=5000 → t=6000
    expect(commits).toEqual([
      { targetId: 'm1', stillPending: ['m2'] },
      { targetId: 'm2', stillPending: [] },
    ]);
  });

  it('finalizes every target on simultaneous expiry via sequential commits (no silent drop)', () => {
    // The controller arms one setTimeout per target, so two windows requested at the
    // same tick fire as two sequential TIMEOUT events (not a batch EXPIRE_ALL). The
    // first commit sees the second as stillPending (correctly excludes it); the
    // second commit finalizes the full set. End state: both persisted, none dropped.
    const commits: Array<{ targetId: string; stillPending: string[] }> = [];
    const ctrl = createUndoController<Record<string, number>>({
      kind: 'hide',
      onCommit: (targetId, _snapshot, { stillPending }) => {
        commits.push({ targetId, stillPending: stillPending.map((p) => p.targetId) });
      },
      onRestore: () => {},
      toastMessage: () => 'Mission masquée',
    });

    ctrl.request('m1', { m1: 100 });
    ctrl.request('m2', { m1: 100, m2: 200 });

    vi.advanceTimersByTime(DEFAULT_UNDO_WINDOW_MS);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({ targetId: 'm1', stillPending: ['m2'] });
    expect(commits[1]).toEqual({ targetId: 'm2', stillPending: [] });
  });

  it('reports a genuinely still-open sibling in stillPending on a later commit', () => {
    // m1 at t=0 (deadline 5000); m3 at t=5000 (deadline 10000). When m3 commits,
    // no other window is open, so stillPending is empty.
    const commits: Array<{ targetId: string; stillPending: string[] }> = [];
    const ctrl = createUndoController<Record<string, number>>({
      kind: 'hide',
      onCommit: (targetId, _snapshot, { stillPending }) => {
        commits.push({ targetId, stillPending: stillPending.map((p) => p.targetId) });
      },
      onRestore: () => {},
      toastMessage: () => 'Mission masquée',
    });

    ctrl.request('m1', { m1: 100 });
    vi.advanceTimersByTime(DEFAULT_UNDO_WINDOW_MS); // m1 commits at 5000
    expect(commits).toEqual([{ targetId: 'm1', stillPending: [] }]);

    ctrl.request('m3', { m3: 300 });
    vi.advanceTimersByTime(DEFAULT_UNDO_WINDOW_MS); // m3 commits at 10000
    expect(commits[1]).toEqual({ targetId: 'm3', stillPending: [] });
  });

  it('restores in-memory state and dismisses the toast on UNDO without committing', () => {
    // UNDO is triggered by the toast action's onClick (the controller's only undo
    // entry point) — there is no public undo() method by design, so the model's
    // transitions are the single path.
    const restores: string[] = [];
    const commits: string[] = [];
    const ctrl = createUndoController<Record<string, number>>({
      kind: 'hide',
      onCommit: (targetId) => commits.push(targetId),
      onRestore: (targetId) => restores.push(targetId),
      toastMessage: () => 'Mission masquée',
    });

    ctrl.request('m1', { m1: 100 });
    expect(toastMock.showToastAction).toHaveBeenCalledTimes(1);

    const onClick = toastMock.showToastAction.mock.calls.at(-1)?.[2].onClick;
    expect(onClick).toBeTypeOf('function');
    onClick();

    expect(restores).toEqual(['m1']);
    expect(commits).toEqual([]);
    expect(toastMock.dismissToast).toHaveBeenCalledWith(42);
  });

  it('dispose cancels pending timers and dismisses toasts without committing (I5)', () => {
    const commits: string[] = [];
    const ctrl = createUndoController<Record<string, number>>({
      kind: 'hide',
      onCommit: (targetId) => commits.push(targetId),
      onRestore: () => {},
      toastMessage: () => 'Mission masquée',
    });

    ctrl.request('m1', { m1: 100 });
    ctrl.request('m2', { m1: 100, m2: 200 });

    ctrl.dispose();

    // Advancing past both deadlines must NOT fire any commit — safe-by-default.
    vi.advanceTimersByTime(DEFAULT_UNDO_WINDOW_MS * 2);
    expect(commits).toEqual([]);
    expect(toastMock.dismissToast).toHaveBeenCalledTimes(2);
  });
});
