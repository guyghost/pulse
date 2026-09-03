import type { Reporter, TestModule } from 'vitest/node';

/**
 * Skip taxonomy reporter — cf. tests/SKIPS.md.
 *
 * Classifies skipped tests and prints per-category counts:
 * - permanent: fullName carries the `[release-blocker:` marker (sentinel tests,
 *   un-skipped only when the blocker is resolved);
 * - env-conditional: everything else (skipIf guards on pinned toolchains).
 */
const PERMANENT_SKIP_MARKER = '[release-blocker:';

export default class SkipTaxonomyReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const permanent: string[] = [];
    const envConditional: string[] = [];
    for (const module of testModules) {
      for (const test of module.children.allTests('skipped')) {
        const target = test.fullName.includes(PERMANENT_SKIP_MARKER) ? permanent : envConditional;
        target.push(test.fullName);
      }
    }
    const total = permanent.length + envConditional.length;
    if (total === 0) {
      return;
    }
    const lines = [
      '',
      `⏭️  Skips — taxonomie (cf. tests/SKIPS.md) : ${total} au total`,
      `   • env-conditionnels : ${envConditional.length}`,
      `   • permanents ([release-blocker:…]) : ${permanent.length}`,
      ...permanent.map((name) => `     - ${name}`),
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
  }
}
