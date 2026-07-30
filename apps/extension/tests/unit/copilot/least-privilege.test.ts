import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return ['.ts', '.svelte'].includes(extname(entry.name)) ? [path] : [];
  });
}

describe('Copilot least-privilege boundary', () => {
  it('keeps account cookies outside the Copilot API permission and runtime', () => {
    const root = resolve(process.cwd(), 'src');
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
      host_permissions?: string[];
    };
    expect(manifest.host_permissions).toContain('https://copilot.missionpulse.app/*');
    expect(manifest.host_permissions).not.toContain('https://missionpulse.app/*');

    const copilotSources = sourceFiles(join(root, 'lib', 'shell', 'copilot'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(copilotSources).not.toContain('chrome.cookies');
    expect(copilotSources).toContain("credentials: 'omit'");

    for (const path of sourceFiles(root)) {
      const source = readFileSync(path, 'utf8');
      if (source.includes('chrome.cookies')) {
        expect(source, path).not.toContain('missionpulse.app');
      }
    }
  });
});
