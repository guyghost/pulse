import { spawnSync } from 'node:child_process';
import { isAbsolute } from 'node:path';

interface TestProcessResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

interface TestProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  stdio: 'ignore';
  windowsHide: true;
}

export type SpawnFixtureTest = (
  executable: string,
  args: readonly string[],
  options: TestProcessOptions
) => TestProcessResult;

function defaultSpawnTest(
  executable: string,
  args: readonly string[],
  options: TestProcessOptions
): TestProcessResult {
  return spawnSync(executable, [...args], options);
}

export function createFixtureTestRunner(input: {
  extensionRoot: string;
  nodeExecutable: string;
  vitestModulePath: string;
  environment: NodeJS.ProcessEnv;
  spawnTest?: SpawnFixtureTest;
}): (relativeTestPath: string) => boolean {
  for (const [label, path] of [
    ['extension root', input.extensionRoot],
    ['Node executable', input.nodeExecutable],
    ['Vitest module', input.vitestModulePath],
  ] as const) {
    if (!isAbsolute(path)) {
      throw new Error(`${label} must be absolute.`);
    }
  }
  const spawnTest = input.spawnTest ?? defaultSpawnTest;
  const environment = { ...input.environment };
  return (relativeTestPath: string): boolean => {
    if (
      !/^tests\/unit\/[A-Za-z0-9_./-]+\.test\.ts$/.test(relativeTestPath) ||
      relativeTestPath.includes('..') ||
      relativeTestPath.includes('\\')
    ) {
      throw new Error('Connector health test path is outside the committed unit-test surface.');
    }
    const result = spawnTest(
      input.nodeExecutable,
      [input.vitestModulePath, 'run', relativeTestPath],
      {
        cwd: input.extensionRoot,
        env: environment,
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    return result.error === undefined && result.status === 0 && result.signal === null;
  };
}
