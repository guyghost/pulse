import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function stripScriptAndStyle(source: string): string {
  return source.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
}

function getVisibleButtonText(buttonMarkup: string): string {
  return buttonMarkup
    .replace(/<Icon\b[\s\S]*?\/>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[#/:@][^}]*\}/g, ' ')
    .replace(/\{[^}]+\}/g, ' expression ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAccessibleName(buttonMarkup: string): boolean {
  return /\baria-label\s*=|\baria-labelledby\s*=/.test(buttonMarkup);
}

describe('icon button accessibility', () => {
  it('gives every icon-only button an accessible name', () => {
    const files = execSync("rg --files src/ui src/sidepanel -g '*.svelte'", {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    const violations: string[] = [];

    for (const file of files) {
      const source = stripScriptAndStyle(readFileSync(file, 'utf8'));
      const buttonPattern = /<button\b[\s\S]*?<\/button>/g;
      let match: RegExpExecArray | null;

      while ((match = buttonPattern.exec(source))) {
        const buttonMarkup = match[0];

        if (!/<Icon\b/.test(buttonMarkup)) {
          continue;
        }

        if (getVisibleButtonText(buttonMarkup) || hasAccessibleName(buttonMarkup)) {
          continue;
        }

        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${file}:${line}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
