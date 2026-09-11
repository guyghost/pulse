import { describe, expect, it } from 'vitest';
import { buildFeedStory, resolveFeedEmptySurface } from '../../../src/lib/core/feed/build-feed-story';

const baseInput = {
  isOffline: false,
  brokenConnectorCount: 0,
  firstBrokenConnectorName: null,
  alertEnabled: false,
  alertScoreThreshold: 80,
  hasCompletedScan: false,
  filterActive: false,
  totalMissionCount: 0,
  searchQuery: '',
  enabledConnectorCount: 1,
  sessionReadyCount: 1,
  reconnectPlatformName: 'Free-Work',
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

  it('does not let the list duplicate an empty story already shown in the hero', () => {
    expect(
      resolveFeedEmptySurface({
        listCount: 0,
        isLoading: false,
        storyVisibleCount: 0,
        storyRenderedInHero: true,
      })
    ).toBe('hero');
  });

  it('routes a silent-hero empty feed to the story, not a generic list empty', () => {
    const neverScanned = buildFeedStory({
      ...baseInput,
      error: null,
      newCount: 0,
      highScoreCount: 0,
      visibleCount: 0,
    });
    const scannedEmpty = buildFeedStory({
      ...baseInput,
      error: null,
      newCount: 0,
      highScoreCount: 0,
      visibleCount: 0,
      hasCompletedScan: true,
    });

    expect(
      resolveFeedEmptySurface({
        listCount: 0,
        isLoading: false,
        storyVisibleCount: 0,
        storyRenderedInHero: false,
      })
    ).toBe('list-story');
    expect(neverScanned.primaryActionId).toBe('start-scan');
    expect(scannedEmpty.primaryActionId).toBe('adjust-profile');
    expect(scannedEmpty.title).not.toBe(neverScanned.title);
  });
});
