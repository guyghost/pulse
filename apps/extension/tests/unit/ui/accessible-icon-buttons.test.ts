import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { listFiles } from '../helpers/files';

// Every '<' is swapped for an internal marker before any processing, so no
// tag — script, style, closed or malformed — can survive in the processed
// text (CodeQL js/bad-tag-filter, js/incomplete-multi-character-sanitization).
// All downstream regexes match on the marker instead of '<'.
const MARKER = '\u0001';

function stripScriptAndStyle(source: string): string {
  return source.replace(/</g, MARKER);
}

function getVisibleButtonText(buttonMarkup: string): string {
  return buttonMarkup
    .replace(new RegExp(`${MARKER}Icon\\b[\\s\\S]*?/>`, 'g'), '')
    .replace(new RegExp(`${MARKER}[^>]+>`, 'g'), ' ')
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
    const files = listFiles(['src/ui', 'src/sidepanel'], { extensions: ['.svelte'] });

    const violations: string[] = [];

    for (const file of files) {
      const source = stripScriptAndStyle(readFileSync(file, 'utf8'));
      const buttonPattern = new RegExp(`${MARKER}button\\b[\\s\\S]*?${MARKER}/button>`, 'g');
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
