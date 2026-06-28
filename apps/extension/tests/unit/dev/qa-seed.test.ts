import { describe, it, expect } from 'vitest';
import {
  buildQaSeed,
  applyQaSeedToLocalStorage,
  QA_LOCALSTORAGE_KEYS,
} from '../../../src/dev/qa-seed';
import { generateMockMissions } from '../../fixtures/large-dataset';
import { deriveHealthStatus } from '../../../src/lib/core/health/derive-health-status';

const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');
const ALL_SOURCES = ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick'] as const;
const ALL_STATUSES = [
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'archived',
] as const;

describe('buildQaSeed — determinism', () => {
  it('produces byte-identical output for the same injected now', () => {
    const a = buildQaSeed(FIXED_NOW);
    const b = buildQaSeed(FIXED_NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces different output for a different now (publishedAt/trackings move)', () => {
    const a = buildQaSeed(FIXED_NOW);
    const b = buildQaSeed(new Date('2026-07-01T08:00:00.000Z'));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('buildQaSeed — missions', () => {
  it('emits exactly 500 missions across all 5 sources', () => {
    const seed = buildQaSeed(FIXED_NOW);
    expect(seed.missions).toHaveLength(500);
    expect(new Set(seed.missions.map((m) => m.source))).toEqual(new Set(ALL_SOURCES));
  });

  it('includes score 0 and score 100 edge missions with matching breakdowns', () => {
    const seed = buildQaSeed(FIXED_NOW);
    expect(seed.missions.some((m) => m.score === 0 && m.scoreBreakdown?.total === 0)).toBe(true);
    expect(seed.missions.some((m) => m.score === 100 && m.scoreBreakdown?.total === 100)).toBe(
      true
    );
  });

  it('includes null client, null location, empty title and a duplicate id', () => {
    const seed = buildQaSeed(FIXED_NOW);
    expect(seed.missions.some((m) => m.client === null)).toBe(true);
    expect(seed.missions.some((m) => m.location === null)).toBe(true);
    expect(seed.missions.some((m) => m.title === '')).toBe(true);

    const counts = new Map<string, number>();
    for (const m of seed.missions) {
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
    expect([...counts.values()].some((c) => c > 1)).toBe(true);
  });

  it('spreads publishedAt over ~30 days', () => {
    const seed = buildQaSeed(FIXED_NOW);
    const ts = seed.missions
      .map((m) => m.publishedAt)
      .filter((p): p is string => typeof p === 'string')
      .map((p) => Date.parse(p));
    const spanDays = (Math.max(...ts) - Math.min(...ts)) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBeGreaterThanOrEqual(28);
  });

  it('emits complete Mission objects (every required field present)', () => {
    const seed = buildQaSeed(FIXED_NOW);
    for (const m of seed.missions) {
      expect(m.scoreBreakdown).not.toBeNull();
      expect(typeof m.publishedAt).toBe('string');
      expect(m.startDate === null || typeof m.startDate === 'string').toBe(true);
      expect(m.scrapedAt instanceof Date).toBe(true);
    }
  });

  it('reuses the deterministic fixture generator algorithm (cross-check)', () => {
    // The base missions (indices 0..494) must be byte-compatible with
    // tests/fixtures/large-dataset.ts for the shared fields. This proves the
    // src generator reuses the fixture's deterministic algorithm/data.
    const seed = buildQaSeed(FIXED_NOW);
    const fixture = generateMockMissions(20, FIXED_NOW);
    for (let i = 0; i < 20; i++) {
      expect(seed.missions[i].id).toBe(fixture[i].id);
      expect(seed.missions[i].source).toBe(fixture[i].source);
      expect(seed.missions[i].client).toBe(fixture[i].client);
      expect(seed.missions[i].tjm).toBe(fixture[i].tjm);
      expect(seed.missions[i].score).toBe(fixture[i].score);
      expect(seed.missions[i].title).toBe(fixture[i].title);
      expect(seed.missions[i].scrapedAt.getTime()).toBe(fixture[i].scrapedAt.getTime());
    }
  });
});

describe('buildQaSeed — favorites / hidden / seen / views / profile', () => {
  it('seeds favorites, hidden, seen and saved views referencing real mission ids', () => {
    const seed = buildQaSeed(FIXED_NOW);
    const ids = new Set(seed.missions.map((m) => m.id));

    expect(Object.keys(seed.favorites).length).toBeGreaterThan(0);
    for (const id of Object.keys(seed.favorites)) {
      expect(ids.has(id)).toBe(true);
    }

    expect(Object.keys(seed.hidden).length).toBeGreaterThan(0);
    for (const id of Object.keys(seed.hidden)) {
      expect(ids.has(id)).toBe(true);
    }

    expect(seed.seen.length).toBeGreaterThan(0);
    expect(seed.seen.length).toBeLessThan(seed.missions.length); // mixed
    for (const id of seed.seen) {
      expect(ids.has(id)).toBe(true);
    }

    expect(seed.savedViews.length).toBeGreaterThanOrEqual(1);
  });

  it('exposes a complete and an incomplete profile variant', () => {
    const seed = buildQaSeed(FIXED_NOW);
    expect(seed.profile.stack.length).toBeGreaterThan(0);
    expect(seed.profile.jobTitle.length).toBeGreaterThan(0);
    expect(seed.profileIncomplete.stack).toEqual([]);
    expect(seed.profileIncomplete.jobTitle).toBe('');
  });

  it('normalizes connected alert preferences', () => {
    const seed = buildQaSeed(FIXED_NOW);
    expect(seed.alertPreferences.enabled).toBe(true);
    expect(seed.alertPreferences.requiredStacks).toContain('TypeScript');
    expect(seed.alertPreferences.updatedAt).toBe(FIXED_NOW.toISOString());
  });
});

describe('buildQaSeed — tracking pipeline', () => {
  it('covers every application status exactly once plus an overdue relance', () => {
    const seed = buildQaSeed(FIXED_NOW);
    expect(seed.trackings.map((t) => t.currentStatus).sort()).toEqual([...ALL_STATUSES].sort());

    const nowMs = FIXED_NOW.getTime();
    const overdue = seed.trackings.filter(
      (t) => t.nextActionAt !== null && Date.parse(t.nextActionAt as string) < nowMs
    );
    expect(overdue.length).toBeGreaterThanOrEqual(1);
  });

  it('builds a valid transition history ending at the current status', () => {
    const seed = buildQaSeed(FIXED_NOW);
    for (const t of seed.trackings) {
      expect(t.history.length).toBeGreaterThanOrEqual(1);
      expect(t.history[0].from).toBeNull();
      expect(t.history[0].to).toBe('detected');
      expect(t.history[t.history.length - 1].to).toBe(t.currentStatus);
    }
  });
});

describe('buildQaSeed — connector health', () => {
  it('derives to healthy, degraded and broken', () => {
    const seed = buildQaSeed(FIXED_NOW);
    const derived = new Set(seed.healthSnapshots.map((s) => deriveHealthStatus(s)));
    expect(derived).toEqual(new Set(['healthy', 'degraded', 'broken']));
  });

  it('covers all 5 connectors', () => {
    const seed = buildQaSeed(FIXED_NOW);
    expect(new Set(seed.healthSnapshots.map((s) => s.connectorId))).toEqual(new Set(ALL_SOURCES));
  });
});

function makeMemStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  } as Storage;
}

describe('applyQaSeedToLocalStorage — writer', () => {
  it('exposes the expected localStorage keys', () => {
    expect(QA_LOCALSTORAGE_KEYS.missions).toBe('__missionpulse_dev_missions');
    expect(QA_LOCALSTORAGE_KEYS.favorites).toBe('__missionpulse_dev_favorites');
    expect(QA_LOCALSTORAGE_KEYS.hidden).toBe('__missionpulse_dev_hidden');
    expect(QA_LOCALSTORAGE_KEYS.seen).toBe('__missionpulse_dev_seen');
    expect(QA_LOCALSTORAGE_KEYS.savedViews).toBe('__missionpulse_dev_saved_views');
    expect(QA_LOCALSTORAGE_KEYS.alertPreferences).toBe('__missionpulse_dev_alert_preferences');
    expect(QA_LOCALSTORAGE_KEYS.profile).toBe('__missionpulse_dev_profile');
    expect(QA_LOCALSTORAGE_KEYS.trackings).toBe('__missionpulse_dev_trackings');
    expect(QA_LOCALSTORAGE_KEYS.health).toBe('__missionpulse_dev_health');
  });

  it('writes every key to the storage sink as valid JSON', () => {
    const sink = makeMemStorage();
    applyQaSeedToLocalStorage(FIXED_NOW, 'complete', sink);

    const missions = JSON.parse(sink.getItem(QA_LOCALSTORAGE_KEYS.missions) ?? '[]');
    expect(missions).toHaveLength(500);

    const profile = JSON.parse(sink.getItem(QA_LOCALSTORAGE_KEYS.profile) ?? 'null');
    expect(profile.stack).toContain('TypeScript');

    const trackings = JSON.parse(sink.getItem(QA_LOCALSTORAGE_KEYS.trackings) ?? '[]');
    expect(trackings).toHaveLength(9);

    const health = JSON.parse(sink.getItem(QA_LOCALSTORAGE_KEYS.health) ?? '[]');
    expect(health).toHaveLength(5);

    expect(sink.getItem(QA_LOCALSTORAGE_KEYS.favorites)).toBeTruthy();
    expect(sink.getItem(QA_LOCALSTORAGE_KEYS.hidden)).toBeTruthy();
    expect(sink.getItem(QA_LOCALSTORAGE_KEYS.seen)).toBeTruthy();
    expect(sink.getItem(QA_LOCALSTORAGE_KEYS.savedViews)).toBeTruthy();
    expect(sink.getItem(QA_LOCALSTORAGE_KEYS.alertPreferences)).toBeTruthy();
  });

  it('writes the incomplete profile when variant="incomplete"', () => {
    const sink = makeMemStorage();
    applyQaSeedToLocalStorage(FIXED_NOW, 'incomplete', sink);
    const profile = JSON.parse(sink.getItem(QA_LOCALSTORAGE_KEYS.profile) ?? 'null');
    expect(profile.stack).toEqual([]);
    expect(profile.jobTitle).toBe('');
  });
});
