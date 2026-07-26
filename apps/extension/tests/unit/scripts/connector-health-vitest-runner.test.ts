import { describe, expect, it, vi } from 'vitest';

import { createFixtureTestRunner } from '../../health/vitest-runner';

describe('connector-health fixture test runner', () => {
  it('invokes the absolute Vitest module through the captured Node executable without a shell', () => {
    const spawnTest = vi.fn(() => ({ status: 0, signal: null, error: undefined }));
    const run = createFixtureTestRunner({
      extensionRoot: '/workspace/apps/extension',
      nodeExecutable: '/runner-tool-cache/node/22.23.1/x64/bin/node',
      vitestModulePath: '/workspace/node_modules/vitest/vitest.mjs',
      environment: { CI: 'true', HOME: '/runner-temp/home' },
      spawnTest,
    });

    expect(run('tests/unit/connectors/freework.test.ts')).toBe(true);
    expect(spawnTest).toHaveBeenCalledWith(
      '/runner-tool-cache/node/22.23.1/x64/bin/node',
      [
        '/workspace/node_modules/vitest/vitest.mjs',
        'run',
        'tests/unit/connectors/freework.test.ts',
      ],
      {
        cwd: '/workspace/apps/extension',
        env: { CI: 'true', HOME: '/runner-temp/home' },
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
  });

  it('fails closed on traversal, a signal or a spawn error', () => {
    const spawnTest = vi.fn(() => ({ status: null, signal: 'SIGSEGV', error: undefined }));
    const run = createFixtureTestRunner({
      extensionRoot: '/workspace/apps/extension',
      nodeExecutable: '/runner/node',
      vitestModulePath: '/workspace/node_modules/vitest/vitest.mjs',
      environment: {},
      spawnTest,
    });

    expect(run('tests/unit/connectors/freework.test.ts')).toBe(false);
    expect(() => run('../escape.test.ts')).toThrow(/test path/i);
  });
});
