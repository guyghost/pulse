import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

export const CONNECTOR_HEALTH_NODE_VERSION = 'v22.23.1';
export const CONNECTOR_HEALTH_PACKAGE_MANAGER =
  'pnpm@10.32.1+sha512.a706938f0e89ac1456b6563eab4edf1d1faf3368d1191fc5c59790e96dc918e4456ab2e67d613de1043d2e8c81f87303e6b40d4ffeca9df15ef1ad567348f2be';

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value === '' || /[\0\r\n]/.test(value)) {
    throw new Error(`Required environment ${name} is absent or malformed.`);
  }
  return value;
}

export async function verifyConnectorHealthRuntime(
  input: {
    environment?: NodeJS.ProcessEnv;
    version?: string;
    executable?: string;
    cwd?: string;
  } = {}
): Promise<{ workspace: string; extensionRoot: string; nodeExecutable: string }> {
  const environment = input.environment ?? process.env;
  const version = input.version ?? process.version;
  if (version !== CONNECTOR_HEALTH_NODE_VERSION) {
    throw new Error(`Connector health requires Node ${CONNECTOR_HEALTH_NODE_VERSION}.`);
  }
  const workspace = await realpath(requiredEnvironment(environment, 'GITHUB_WORKSPACE'));
  const extensionRoot = await realpath(join(workspace, 'apps/extension'));
  if ((await realpath(input.cwd ?? process.cwd())) !== extensionRoot) {
    throw new Error('Connector health cwd must be the exact extension root.');
  }
  const runnerToolCache = await realpath(requiredEnvironment(environment, 'RUNNER_TOOL_CACHE'));
  const nodeExecutable = await realpath(input.executable ?? process.execPath);
  const nodeRelative = relative(runnerToolCache, nodeExecutable);
  if (nodeRelative.startsWith('..') || isAbsolute(nodeRelative)) {
    throw new Error('Connector health Node executable is outside RUNNER_TOOL_CACHE.');
  }
  const nodeStat = await lstat(nodeExecutable);
  if (!nodeStat.isFile() || nodeStat.isSymbolicLink()) {
    throw new Error('Connector health Node executable is not a no-follow regular file.');
  }
  const packageDocument: unknown = JSON.parse(
    await readFile(join(workspace, 'package.json'), 'utf8')
  );
  if (
    typeof packageDocument !== 'object' ||
    packageDocument === null ||
    Array.isArray(packageDocument) ||
    (packageDocument as Record<string, unknown>).packageManager !== CONNECTOR_HEALTH_PACKAGE_MANAGER
  ) {
    throw new Error('Root packageManager identity/integrity does not match policy.');
  }
  return { workspace, extensionRoot, nodeExecutable };
}

export function requireConnectorHealthEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string
): string {
  return requiredEnvironment(environment, name);
}
