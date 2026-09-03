import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { filledIconPaths, iconPaths, type IconName } from '../src/icons/paths';
import { serializeSvgChildren } from '../src/icons/serialize';
import Icon from '../src/icons/Icon.svelte';

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
    const essential: IconName[] = [
      'search',
      'x',
      'check',
      'chevron-down',
      'star',
      'loader',
      'list-filter',
    ];
    for (const name of essential) {
      expect(iconPaths[name]).toBeDefined();
    }
  });
});

describe('SVG serialization', () => {
  it('serializes every stroke icon without throwing', () => {
    for (const [name, children] of Object.entries(iconPaths)) {
      expect(() => serializeSvgChildren(children), `icon "${name}"`).not.toThrow();
    }
  });

  it('serializes every filled icon without throwing', () => {
    for (const [name, children] of Object.entries(filledIconPaths)) {
      expect(() => serializeSvgChildren(children), `filled icon "${name}"`).not.toThrow();
    }
  });

  it('renders nested group children as elements, not flattened values', () => {
    const html = serializeSvgChildren(filledIconPaths.settings ?? []);
    expect(html).toContain('<g transform="rotate(45 12 12)">');
    // The group must contain 4 self-closing rects; flattened tuples would
    // emit garbage like `<r 0="e" />` or crash on Object.entries(undefined).
    const group = html.slice(html.indexOf('<g '));
    const rectCount = (group.match(/<rect /g) ?? []).length;
    expect(rectCount).toBe(4);
    expect(html).not.toMatch(/<r 0=/);
  });

  it('renders the filled settings icon through the component without crashing', () => {
    const { body } = render(Icon, { props: { name: 'settings', filled: true } });
    expect(body).toContain('<g transform="rotate(45 12 12)">');
    expect(body).toContain('fill="currentColor"');
    expect(body).not.toMatch(/<r 0=/);
  });
});
