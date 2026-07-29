import { describe, expect, it } from 'vitest';

import {
  createOnboardingFlowController,
  type OnboardingFlowController,
  type OnboardingFlowEvent,
} from '../../../src/models/onboarding-flow.machine';

const ATTEMPT_ID = 'onb_test-attempt-0001';
const SOURCES = [{ id: 'free-work' }, { id: 'lehibou' }] as const;

function makeController(): OnboardingFlowController {
  const c = createOnboardingFlowController({
    attemptId: ATTEMPT_ID,
    sources: [...SOURCES],
  });
  c.start();
  return c;
}

/** Drive the controller through a sequence of events, returning the final snapshot. */
function run(controller: OnboardingFlowController, events: OnboardingFlowEvent[]) {
  for (const e of events) {
    controller.send(e);
  }
  return controller.getSnapshot();
}

/** Fill identity + preferences + skills to satisfy every step guard. */
function fullProfileEvents(): OnboardingFlowEvent[] {
  return [
    { type: 'UPDATE_PROFILE', partial: { firstName: 'Alex', jobTitle: 'Dev' } },
    { type: 'NEXT' }, // identity → preferences
    { type: 'UPDATE_PROFILE', partial: { tjmMin: 600, tjmMax: 800 } },
    { type: 'NEXT' }, // preferences → skills
    { type: 'UPDATE_PROFILE', partial: { keywords: ['React', 'TS'] } },
    { type: 'NEXT' }, // skills → notifying
  ];
}

describe('onboarding-flow machine', () => {
  describe('nominal path', () => {
    it('projects five monotonic user decisions without counting technical states', () => {
      const c = makeController();
      expect(c.getSnapshot().progress).toEqual({ current: 0, total: 5 });

      c.send({ type: 'START' });
      expect(c.getSnapshot().progress).toEqual({ current: 1, total: 5 });
      c.send({ type: 'CONNECT_SOURCE', sourceId: 'free-work' });
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().progress).toEqual({ current: 2, total: 5 });
      c.send({ type: 'UPDATE_PROFILE', partial: { firstName: 'Alex', jobTitle: 'Dev' } });
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().progress).toEqual({ current: 3, total: 5 });
      c.send({ type: 'UPDATE_PROFILE', partial: { tjmMin: 600, tjmMax: 800 } });
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().progress).toEqual({ current: 4, total: 5 });
      c.send({ type: 'UPDATE_PROFILE', partial: { keywords: ['TypeScript'] } });
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().progress).toEqual({ current: 5, total: 5 });
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().progress).toEqual({ current: 5, total: 5 });
      c.send({ type: 'PERSISTED' });
      expect(c.getSnapshot().progress).toEqual({ current: 5, total: 5 });
    });

    it('reaches completed via welcome→connect→wizard→notify→persist→scan', () => {
      const c = makeController();
      const final = run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' }, // → wizard (identity)
        ...fullProfileEvents(), // → notifying
        { type: 'SET_NOTIFY', enabled: true },
        { type: 'NEXT' }, // → persisting (emits PERSIST_PROFILE)
        { type: 'PERSISTED' }, // → scanning (emits START_SCAN)
        { type: 'SCAN_DONE' }, // → completed
      ]);

      expect(final.phase).toBe('completed');
      expect(final.terminal).toBe(true);
      expect(final.error).toBeNull();
      expect(final.notifyEnabled).toBe(true);
      expect(final.connectedSources).toEqual(['free-work']);
    });

    it('derives phase from state value (never desyncs from wizardStep)', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
      ]);
      const s = c.getSnapshot();
      expect(s.phase).toBe('wizard');
      expect(s.wizardStep).toBe('identity');
    });

    it('emits PERSIST_PROFILE then START_SCAN as distinct pending effects', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        ...fullProfileEvents(),
        { type: 'NEXT' }, // → persisting
      ]);
      const persistEffect = c.getSnapshot().pendingEffect;
      expect(persistEffect?.kind).toBe('PERSIST_PROFILE');

      c.send({ type: 'PERSISTED' });
      const scanEffect = c.getSnapshot().pendingEffect;
      expect(scanEffect?.kind).toBe('START_SCAN');
      expect(scanEffect).toMatchObject({ kind: 'START_SCAN', partial: false });
    });

    it('PERSIST_PROFILE preserves a narrow tjmMax instead of widening it', () => {
      // Regression: finalizeProfile used to write tjmMax = max(tjmMax, tjmMin+100),
      // silently discarding a valid narrow range (e.g. 800-850). The guard only
      // enforces tjmMax >= tjmMin, so the user's explicit max must be honored.
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        { type: 'UPDATE_PROFILE', partial: { firstName: 'A', jobTitle: 'B' } },
        { type: 'NEXT' },
        { type: 'UPDATE_PROFILE', partial: { tjmMin: 800, tjmMax: 850 } },
        { type: 'NEXT' },
        { type: 'UPDATE_PROFILE', partial: { keywords: ['React'] } },
        { type: 'NEXT' }, // skills → notifying
        { type: 'NEXT' }, // notifying → persisting
      ]);
      const effect = c.getSnapshot().pendingEffect;
      expect(effect?.kind).toBe('PERSIST_PROFILE');
      if (effect.kind === 'PERSIST_PROFILE') {
        expect(effect.profile.tjmMin).toBe(800);
        expect(effect.profile.tjmMax).toBe(850); // not widened to 900
      }
    });
  });

  describe('skip path', () => {
    it('SKIP from welcome → scanning → completed with partial scan', () => {
      const c = makeController();
      run(c, [{ type: 'SKIP' }]);
      expect(c.getSnapshot().phase).toBe('scanning');
      expect(c.getSnapshot().pendingEffect).toMatchObject({ kind: 'START_SCAN', partial: true });

      c.send({ type: 'SCAN_DONE' });
      expect(c.getSnapshot().phase).toBe('completed');
      expect(c.getSnapshot().terminal).toBe(true);
    });

    it('SKIP mid-wizard still reaches scanning (never a dead-end)', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        { type: 'SKIP' },
      ]);
      expect(c.getSnapshot().phase).toBe('scanning');
      expect(c.getSnapshot().pendingEffect?.kind).toBe('START_SCAN');
    });
  });

  describe('back-navigation', () => {
    it('connecting BACK → welcome', () => {
      const c = makeController();
      run(c, [{ type: 'START' }, { type: 'BACK' }]);
      expect(c.getSnapshot().phase).toBe('welcome');
    });

    it('UPDATE_PROFILE is admitted in welcome so the shell can rehydrate an existing profile', () => {
      const c = makeController();
      // The shell rehydrates a persisted profile before the user advances.
      c.send({
        type: 'UPDATE_PROFILE',
        partial: { firstName: 'Rehydrated', jobTitle: 'Dev', tjmMin: 700, tjmMax: 900 },
      });
      // Stays in welcome, but the draft is merged (pre-fills the wizard later).
      const snap = c.getSnapshot();
      expect(snap.phase).toBe('welcome');
      expect(snap.profile.firstName).toBe('Rehydrated');
      expect(snap.profile.tjmMin).toBe(700);
      expect(snap.profile.tjmMax).toBe(900);
    });

    it('wizard BACK from first step → connecting', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
      ]);
      expect(c.getSnapshot().phase).toBe('wizard');
      c.send({ type: 'BACK' });
      expect(c.getSnapshot().phase).toBe('connecting');
    });

    it('wizard BACK from later steps decrements wizardStep internally', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        ...fullProfileEvents().slice(0, 2), // identity filled + NEXT → preferences
      ]);
      expect(c.getSnapshot().wizardStep).toBe('preferences');
      c.send({ type: 'BACK' });
      expect(c.getSnapshot().phase).toBe('wizard');
      expect(c.getSnapshot().wizardStep).toBe('identity');
    });

    it('notifying BACK → wizard preserves the current step', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        ...fullProfileEvents(), // ends in notifying
      ]);
      expect(c.getSnapshot().phase).toBe('notifying');
      c.send({ type: 'BACK' });
      expect(c.getSnapshot().phase).toBe('wizard');
      expect(c.getSnapshot().wizardStep).toBe('skills');
    });
  });

  describe('error paths (never block first value)', () => {
    it('SCAN_FAILED → completed with typed error', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        ...fullProfileEvents(),
        { type: 'NEXT' },
        { type: 'PERSISTED' },
        { type: 'SCAN_FAILED', message: 'boom' },
      ]);
      const s = c.getSnapshot();
      expect(s.phase).toBe('completed');
      expect(s.terminal).toBe(true);
      expect(s.error).toEqual({ type: 'scan_failed', message: 'boom' });
    });

    it('PERSIST_FAILED → scanning still runs (never blocks first value)', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        ...fullProfileEvents(),
        { type: 'NEXT' }, // → persisting
        { type: 'PERSIST_FAILED', message: 'disk full' },
      ]);
      const s = c.getSnapshot();
      expect(s.phase).toBe('scanning');
      expect(s.pendingEffect?.kind).toBe('START_SCAN');
      expect(s.error).toEqual({ type: 'persist_failed', message: 'disk full' });
    });
  });

  describe('wizard step guards (pure decisions)', () => {
    it('cannot leave identity with empty firstName or jobTitle', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
      ]);
      expect(c.getSnapshot().canAdvance).toBe(false);
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().wizardStep).toBe('identity'); // blocked
      c.send({ type: 'UPDATE_PROFILE', partial: { firstName: 'Alex' } });
      expect(c.getSnapshot().canAdvance).toBe(false); // still missing jobTitle
      c.send({ type: 'UPDATE_PROFILE', partial: { jobTitle: 'Dev' } });
      expect(c.getSnapshot().canAdvance).toBe(true);
    });

    it('cannot leave preferences when tjmMax < tjmMin', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        { type: 'UPDATE_PROFILE', partial: { firstName: 'A', jobTitle: 'B' } },
        { type: 'NEXT' }, // → preferences
      ]);
      c.send({ type: 'UPDATE_PROFILE', partial: { tjmMin: 900, tjmMax: 500 } });
      expect(c.getSnapshot().canAdvance).toBe(false);
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().wizardStep).toBe('preferences'); // blocked
    });

    it('cannot leave skills with no keywords', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        { type: 'UPDATE_PROFILE', partial: { firstName: 'A', jobTitle: 'B' } },
        { type: 'NEXT' },
        { type: 'UPDATE_PROFILE', partial: { tjmMin: 500, tjmMax: 800 } },
        { type: 'NEXT' }, // → skills
      ]);
      expect(c.getSnapshot().canAdvance).toBe(false);
    });
  });

  describe('connecting guard', () => {
    it('cannot advance to wizard without a connected source', () => {
      const c = makeController();
      run(c, [{ type: 'START' }]);
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().phase).toBe('connecting'); // blocked
      c.send({ type: 'CONNECT_SOURCE', sourceId: 'lehibou' });
      c.send({ type: 'NEXT' });
      expect(c.getSnapshot().phase).toBe('wizard');
    });

    it('DISCONNECT_SOURCE removes a source', () => {
      const c = makeController();
      run(c, [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'CONNECT_SOURCE', sourceId: 'lehibou' },
        { type: 'DISCONNECT_SOURCE', sourceId: 'free-work' },
      ]);
      expect(c.getSnapshot().connectedSources).toEqual(['lehibou']);
    });
  });

  describe('re-entry guard & terminal idempotency', () => {
    it('completed is final: further events do not change the snapshot', () => {
      const c = makeController();
      run(c, [{ type: 'SKIP' }, { type: 'SCAN_DONE' }]);
      const terminal = c.getSnapshot();
      expect(terminal.terminal).toBe(true);
      // Attempt to re-drive; final states admit no transitions.
      c.send({ type: 'START' });
      c.send({ type: 'NEXT' });
      c.send({ type: 'SKIP' });
      expect(c.getSnapshot()).toStrictEqual(terminal);
    });

    it('re-running the full flow on a fresh controller is deterministic', () => {
      const a = makeController();
      const b = makeController();
      const events: OnboardingFlowEvent[] = [
        { type: 'START' },
        { type: 'CONNECT_SOURCE', sourceId: 'free-work' },
        { type: 'NEXT' },
        ...fullProfileEvents(),
        { type: 'NEXT' },
        { type: 'PERSISTED' },
        { type: 'SCAN_DONE' },
      ];
      run(a, events);
      run(b, events);
      expect(a.getSnapshot()).toStrictEqual(b.getSnapshot());
    });
  });

  describe('input validation', () => {
    it('accepts an empty sources catalog (degenerate build, all connectors excluded)', () => {
      // Empty catalog must NOT throw — the user can still SKIP to a default
      // scan. See onboarding-flow.contract.ts `parseOnboardingFlowInput`.
      const ctrl = createOnboardingFlowController({ attemptId: ATTEMPT_ID, sources: [] });
      expect(ctrl.getSnapshot().phase).toBe('welcome');
      ctrl.stop();
    });

    it('rejects a malformed source entry', () => {
      expect(() =>
        createOnboardingFlowController({
          attemptId: ATTEMPT_ID,
          sources: [{ id: '' }],
        })
      ).toThrow(/invalid source entry/);
    });

    it('rejects a duplicate source id', () => {
      expect(() =>
        createOnboardingFlowController({
          attemptId: ATTEMPT_ID,
          sources: [{ id: 'free-work' }, { id: 'free-work' }],
        })
      ).toThrow(/duplicate source id/);
    });

    it('rejects a missing attemptId', () => {
      expect(() =>
        createOnboardingFlowController({
          attemptId: '',
          sources: [...SOURCES],
        })
      ).toThrow(/attemptId/);
    });
  });
});
