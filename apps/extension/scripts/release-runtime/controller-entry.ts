import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  RELEASE_RUNTIME_CONTRACT,
  ReleaseRuntimeContractError,
  observeReleasePayloadFromDescriptors,
} from './contract';
import {
  type ReleaseRuntimeControllerPorts,
  type ReleaseRuntimeEvidenceV1,
  authorizeRuntimeForRelease,
} from './controller';
import { observeReleaseRuntime } from './runtime-probe';
import { captureBoundedRegularFile } from './secure-capture';
import { parseStrictJsonBytes } from './strict-json';

export const RELEASE_CONTROLLER_EXECUTION_AUTHORITY_PATH =
  '/inputs/evidence/release-controller-execution-authority.json';
const MAX_EXECUTION_AUTHORITY_BYTES = 1_048_576;

export async function readReleaseControllerExecutionAuthorityFile(path: string): Promise<unknown> {
  const captured = await captureBoundedRegularFile(
    path,
    'release controller execution authority',
    MAX_EXECUTION_AUTHORITY_BYTES
  );
  return parseStrictJsonBytes(
    captured.bytes,
    'release controller execution authority',
    MAX_EXECUTION_AUTHORITY_BYTES
  );
}

export interface ReleaseControllerMainDependencies {
  readonly ports: ReleaseRuntimeControllerPorts;
}

const productionDependencies: ReleaseControllerMainDependencies = Object.freeze({
  ports: Object.freeze({
    readExecutionAuthority: async () =>
      readReleaseControllerExecutionAuthorityFile(RELEASE_CONTROLLER_EXECUTION_AUTHORITY_PATH),
    observeRuntime: observeReleaseRuntime,
    observePayload: async () =>
      observeReleasePayloadFromDescriptors({
        candidatePath: RELEASE_RUNTIME_CONTRACT.candidatePath,
        evidencePath: RELEASE_RUNTIME_CONTRACT.evidencePath,
        controllerPath: RELEASE_RUNTIME_CONTRACT.controllerPath,
        ignoredEvidencePath: 'release-controller-execution-authority.json',
      }),
    publishRuntimeEvidence: async (evidence: ReleaseRuntimeEvidenceV1) => {
      process.stdout.write(JSON.stringify(evidence));
    },
  }),
});

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: ReleaseControllerMainDependencies = productionDependencies
): Promise<void> {
  if (argv.length !== 0) {
    throw new ReleaseRuntimeContractError('The release runtime controller accepts no CLI input.');
  }
  await authorizeRuntimeForRelease(dependencies.ports);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
