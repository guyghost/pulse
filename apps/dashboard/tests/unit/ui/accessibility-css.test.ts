import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dashboard accessibility CSS', () => {
  const source = readFileSync('src/app.css', 'utf8');

  it('restores visible keyboard focus even when utility classes remove outlines', () => {
    expect(source).toContain('a:focus-visible');
    expect(source).toContain('button:focus-visible');
    expect(source).toContain('input:focus-visible');
    expect(source).toContain('outline: 2px solid var(--color-blueprint-blue) !important;');
    expect(source).toContain('outline-offset: 3px;');
    expect(source).toContain('box-shadow: 0 0 0 4px rgba(11, 100, 233, 0.16);');
  });

  it('honors reduced motion preferences globally', () => {
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toContain('scroll-behavior: auto !important;');
    expect(source).toContain('transition-duration: 0.01ms !important;');
    expect(source).toContain('animation-duration: 0.01ms !important;');
  });
});
