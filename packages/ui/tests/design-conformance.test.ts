import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const atomsDir = join(root, 'src/lib/atoms');

function readAtom(name: string) {
  return readFileSync(join(atomsDir, name), 'utf8');
}

describe('Design system conformance', () => {
  it('exposes the package stylesheet from the design token source of truth', () => {
    const css = readFileSync(join(root, 'src/app.css'), 'utf8');

    expect(css).toContain("@import '../../design/theme.css'");
    expect(css).toContain('Source of truth: packages/design/theme.css');
  });

  it('keeps atoms within the compact Analytical Blueprint radius and elevation language', () => {
    const atomSources = readdirSync(atomsDir)
      .filter((file) => file.endsWith('.svelte'))
      .map((file) => [file, readAtom(file)] as const);

    for (const [file, source] of atomSources) {
      expect(source, `${file} should not use oversized component radius`).not.toContain(
        'rounded-2xl'
      );
      expect(source, `${file} should not use heavy shadow elevation`).not.toContain('shadow-lg');
    }
  });

  it('uses the expected component radii for core primitives', () => {
    expect(readAtom('Button.svelte')).toContain('rounded-lg');
    expect(readAtom('GlowButton.svelte')).toContain('rounded-lg');
    expect(readAtom('GlassCard.svelte')).toContain('rounded-md');
    expect(readAtom('Skeleton.svelte')).toContain('rounded-md');
    expect(readAtom('Chip.svelte')).toContain('rounded-full');
  });

  it('keeps interactive atoms keyboard focus visible', () => {
    for (const file of ['Button.svelte', 'GlowButton.svelte', 'Chip.svelte', 'GlassCard.svelte']) {
      expect(readAtom(file), `${file} should expose a visible focus state`).toContain(
        'focus-visible:outline-blueprint-blue'
      );
    }
  });

  it('lets a composite own the single live region while preserving standalone Toast alerts', () => {
    const toast = readAtom('Toast.svelte');

    expect(toast).toContain('announce = true');
    expect(toast).toContain('announce?: boolean');
    expect(toast).toContain("role={announce ? 'alert' : undefined}");
  });
});
