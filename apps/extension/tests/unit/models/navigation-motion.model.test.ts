import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  getPagePosition,
  type Page,
} from '../../../src/lib/state/app-navigation.svelte';

describe('navigation motion model', () => {
  it('keeps the six canonical product destinations unique and reachable', () => {
    expect(NAV_ITEMS.map((item) => item.page)).toEqual([
      'feed',
      'profile',
      'cv',
      'applications',
      'tjm',
      'settings',
    ]);
    expect(new Set(NAV_ITEMS.map((item) => item.page)).size).toBe(NAV_ITEMS.length);
  });

  it('projects exactly one current page for every canonical destination', () => {
    const pages = NAV_ITEMS.map((item) => item.page);

    for (const currentPage of pages) {
      const positions = pages.map((page) => getPagePosition(page, currentPage));
      expect(positions.filter((position) => position === 'current')).toHaveLength(1);
    }
  });

  it('projects forward and backward page positions from the canonical order', () => {
    const currentPage: Page = 'applications';

    expect(getPagePosition('feed', currentPage)).toBe('before');
    expect(getPagePosition('profile', currentPage)).toBe('before');
    expect(getPagePosition('cv', currentPage)).toBe('before');
    expect(getPagePosition('applications', currentPage)).toBe('current');
    expect(getPagePosition('tjm', currentPage)).toBe('after');
    expect(getPagePosition('settings', currentPage)).toBe('after');
  });
});
