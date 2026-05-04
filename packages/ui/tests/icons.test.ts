import { describe, it, expect } from 'vitest';
import { iconPaths, type IconName } from '../src/icons/paths';

describe('Icon registry', () => {
  it('exports a non-empty map of icon paths', () => {
    const names = Object.keys(iconPaths);
    expect(names.length).toBeGreaterThan(0);
  });

  it('every icon has at least one SVG child element', () => {
    for (const [name, children] of Object.entries(iconPaths)) {
      expect(children.length, `icon "${name}" should have children`).toBeGreaterThan(0);
    }
  });

  it('IconName type covers key icons', () => {
    const essential: IconName[] = ['search', 'x', 'check', 'chevron-down', 'star', 'loader'];
    for (const name of essential) {
      expect(iconPaths[name]).toBeDefined();
    }
  });
});
