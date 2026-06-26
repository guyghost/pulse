/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import { scoreMission } from '../../../src/lib/core/scoring/relevance';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';

/**
 * Regression test for dev-mode profile-save propagation.
 *
 * In dev mode (`pnpm dev`, no service worker), `chrome.*` is stubbed by
 * `src/dev/chrome-stubs.ts`. Saving a profile MUST mirror the production
 * service worker (`src/background/index.ts`, SAVE_PROFILE handler): it must
 * rescore missions against the new profile and broadcast BOTH a
 * `PROFILE_UPDATED` message AND a `MISSIONS_UPDATED` message — otherwise the
 * feed keeps stale relevance scores.
 *
 * The rescore/MISSIONS_UPDATED emission is implemented in `src/dev/chrome-stubs.ts`.
 */
describe('dev chrome stub — SAVE_PROFILE propagation', () => {
  // Distinctive stack so a profile-influenced rescore is observable.
  const savedProfile: UserProfile = {
    firstName: 'Rustacean',
    stack: ['rust', 'wasm'],
    tjmMin: 550,
    tjmMax: 950,
    location: 'Paris',
    remote: 'full',
    seniority: 'senior',
    jobTitle: 'Systems Engineer',
    searchKeywords: [],
  };

  type DevMessage = { type: string; payload?: unknown };
  let received: DevMessage[];

  beforeEach(() => {
    received = [];

    // Ensure a clean chrome global. `installChromeStubs()` skips installation
    // when `globalThis.chrome.runtime.id` is already set, so we must remove any
    // previously installed stub to get a fresh listener registry each run.
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    // Dev missions/profile are persisted to localStorage by the stub; reset so
    // the default mock missions are used as the rescore source.
    try {
      window.localStorage?.clear();
    } catch {
      // Some Node/jsdom combinations expose no usable localStorage. The dev
      // stub already falls back to mock data in that case.
    }

    installChromeStubs();

    chrome.runtime.onMessage.addListener((message: DevMessage) => {
      received.push(message);
    });
  });

  it('emits PROFILE_UPDATED and MISSIONS_UPDATED with profile-consistent scores', async () => {
    await chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', payload: savedProfile });
    // Flush any pending microtasks/macrotasks before asserting message delivery.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const profileMessages = received.filter((m) => m.type === 'PROFILE_UPDATED');
    const missionsMessages = received.filter((m) => m.type === 'MISSIONS_UPDATED');

    expect(profileMessages, 'SAVE_PROFILE should broadcast PROFILE_UPDATED').toHaveLength(1);
    expect(profileMessages[0]?.payload).toEqual(savedProfile);

    expect(missionsMessages, 'SAVE_PROFILE should broadcast MISSIONS_UPDATED').toHaveLength(1);

    const payload = missionsMessages[0]?.payload;
    expect(Array.isArray(payload), 'MISSIONS_UPDATED payload must be an array').toBe(true);

    const missions = (payload as unknown[]).filter(Boolean);
    expect(
      missions.length,
      'MISSIONS_UPDATED must carry the rescored missions, not an empty array'
    ).toBeGreaterThan(0);

    // Every emitted mission's score must equal the deterministic score produced
    // by the pure `scoreMission` for the just-saved profile. This locks in that
    // the stub actually rescored against the new profile (rather than emitting
    // stale/random scores). Mock missions all have `startDate: null`, so the
    // start-date bonus is 0 and the score is independent of `now`.
    for (const raw of missions) {
      const emitted = raw as { score: number | null };
      const scoreable = coerceMission(raw);
      const expectedScore = scoreMission(scoreable, savedProfile).total;

      expect(emitted.score, `mission "${scoreable.id}" score must reflect saved profile`).toBe(
        expectedScore
      );
    }
  });
});

/**
 * Coerce a serialized bridge mission (where `scrapedAt` may be an ISO string)
 * back into a `Mission` so it can be fed to the pure `scoreMission` function.
 * `scoreMission` does not read `scrapedAt`, so its exact type is irrelevant to
 * the score — we normalize it only to satisfy the `Mission` contract.
 */
function coerceMission(raw: unknown): Mission {
  const serialized = raw as Omit<Mission, 'scrapedAt'> & { scrapedAt: string | Date };
  return {
    ...serialized,
    scrapedAt:
      serialized.scrapedAt instanceof Date ? serialized.scrapedAt : new Date(serialized.scrapedAt),
  };
}
