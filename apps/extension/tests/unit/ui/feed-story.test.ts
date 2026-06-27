import { describe, expect, it } from 'vitest';
import { buildFeedStory } from '../../../src/ui/pages/FeedPage.svelte';

const baseInput = {
  isOffline: false,
  brokenConnectorCount: 0,
  firstBrokenConnectorName: null,
  alertEnabled: false,
  alertScoreThreshold: 80,
};

describe('buildFeedStory', () => {
  it('degrades to a warning (not critical) when cached missions remain visible during an error', () => {
    const degraded = buildFeedStory({
      ...baseInput,
      error: '[Dev] Simulated error',
      newCount: 3,
      highScoreCount: 1,
      visibleCount: 5,
    });

    // FEED-02: the feed list still renders cached missions, so the hero story
    // must not scream a critical "impossible to retrieve" incident.
    expect(degraded.severity).not.toBe('critical');
    expect(degraded.severity).toBe('incident');
    expect(degraded.title).not.toContain('Impossible');
    expect(degraded.primaryActionLabel).toContain('Réessayer');
  });

  it('stays critical when an error leaves no visible missions', () => {
    const critical = buildFeedStory({
      ...baseInput,
      error: '[Dev] Simulated error',
      newCount: 0,
      highScoreCount: 0,
      visibleCount: 0,
    });

    expect(critical.severity).toBe('critical');
    expect(critical.title).toContain('Impossible');
  });
});
