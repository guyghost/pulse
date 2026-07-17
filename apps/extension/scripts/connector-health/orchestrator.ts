import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createActor } from 'xstate';

import {
  buildHealthChildInvocation,
  captureBoundedChild,
  type HealthChildInvocation,
  type SpawnHealthProcess,
  type SignalProcess,
} from './capture';
import { encodeConnectorHealthCaptureSnapshot } from './capture-snapshot';
import {
  buildConnectorHealthEvidence,
  sha256Hex,
  validateConnectorHealthEvidenceBytes,
  type CapturedChild,
  type ConnectorHealthEvidenceV1,
} from './contracts';
import {
  provideConnectorHealthCaptureEffects,
  sendConnectorHealthEvent,
  type EvidenceIdentity,
} from './workflow-machine';

interface CaptureSource {
  repository: string;
  sourceCommit: string;
  eventKind: 'schedule' | 'workflow_dispatch';
  ref: string;
  runId: string;
  runAttempt: number;
}

async function persistRegularFileAtomically(
  outputPath: string,
  bytes: Uint8Array
): Promise<Buffer> {
  const parent = dirname(outputPath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  try {
    await access(outputPath, constants.F_OK);
    throw new Error('Connector health evidence output already exists.');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  const temporaryPath = `${outputPath}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let temporaryCreated = false;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    temporaryCreated = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
    const stat = await lstat(outputPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error('Connector health evidence output is not one regular file.');
    }
    return await readFile(outputPath);
  } finally {
    await handle?.close().catch(() => undefined);
    if (temporaryCreated) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

export async function runConnectorHealthCapture(input: {
  extensionRoot: string;
  nodeExecutable: string;
  home: string;
  outputPath: string;
  snapshotPath: string;
  capturedAt: string;
  source: CaptureSource;
  spawnProcess?: SpawnHealthProcess;
  signalProcess?: SignalProcess;
  timeoutMs?: number;
  closeTimeoutMs?: number;
  groupProbeIntervalMs?: number;
  terminationGraceMs?: number;
  abortSignal?: AbortSignal;
}): Promise<{
  disposition: 'passed' | 'failed';
  failureFingerprint: string | null;
  evidenceFileSha256: string;
  captureSnapshotSha256: string;
  evidence: ConnectorHealthEvidenceV1;
}> {
  let invocation: HealthChildInvocation | undefined;
  let child: CapturedChild | undefined;
  let persisted: Buffer | undefined;
  let evidence: ConnectorHealthEvidenceV1 | undefined;
  let effectFailure: unknown;

  const ownEffect = async <T>(effect: () => Promise<T>): Promise<T> => {
    try {
      return await effect();
    } catch (error) {
      effectFailure = error;
      throw error;
    }
  };
  const requireActive = (signal: AbortSignal): void => {
    if (signal.aborted) {
      throw new Error('Connector health capture effect was cancelled.');
    }
  };
  const identityOf = (bytes: Uint8Array, value: ConnectorHealthEvidenceV1): EvidenceIdentity => ({
    disposition: value.disposition,
    failureFingerprint: value.failureFingerprint,
    evidenceFileSha256: sha256Hex(bytes),
  });

  const logic = provideConnectorHealthCaptureEffects({
    bindSource: (signal) =>
      ownEffect(async () => {
        requireActive(signal);
        if (
          !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(input.source.repository) ||
          !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.source.sourceCommit) ||
          !/^refs\/heads\/[A-Za-z0-9._/-]{1,240}$/.test(input.source.ref) ||
          !/^\d{1,32}$/.test(input.source.runId) ||
          !Number.isSafeInteger(input.source.runAttempt) ||
          input.source.runAttempt < 1
        ) {
          throw new Error('Connector health capture source identity is malformed.');
        }
      }),
    prepareToolchain: (signal) =>
      ownEffect(async () => {
        requireActive(signal);
        invocation = buildHealthChildInvocation({
          extensionRoot: input.extensionRoot,
          nodeExecutable: input.nodeExecutable,
          home: input.home,
        });
      }),
    runHealthCheck: (signal) =>
      ownEffect(async () => {
        requireActive(signal);
        if (invocation === undefined) {
          throw new Error('Connector health toolchain invocation was not retained.');
        }
        child = await captureBoundedChild(invocation, {
          spawnProcess: input.spawnProcess,
          signalProcess: input.signalProcess,
          abortSignal: signal,
          timeoutMs: input.timeoutMs,
          closeTimeoutMs: input.closeTimeoutMs,
          groupProbeIntervalMs: input.groupProbeIntervalMs,
          terminationGraceMs: input.terminationGraceMs,
        });
      }),
    persistEvidence: (signal) =>
      ownEffect(async () => {
        requireActive(signal);
        if (child === undefined) {
          throw new Error('Connector health child observation was not retained.');
        }
        const built = buildConnectorHealthEvidence({
          capturedAt: input.capturedAt,
          source: input.source,
          child,
        });
        persisted = await persistRegularFileAtomically(input.outputPath, built.bytes);
        requireActive(signal);
        evidence = validateConnectorHealthEvidenceBytes(persisted);
        return identityOf(persisted, evidence);
      }),
    validateEvidence: (identity, signal) =>
      ownEffect(async () => {
        requireActive(signal);
        const reread = await readFile(input.outputPath);
        const validated = validateConnectorHealthEvidenceBytes(reread);
        const observed = identityOf(reread, validated);
        if (
          observed.disposition !== identity.disposition ||
          observed.failureFingerprint !== identity.failureFingerprint ||
          observed.evidenceFileSha256 !== identity.evidenceFileSha256
        ) {
          throw new Error('Connector health persisted evidence identity drifted on validation.');
        }
        persisted = reread;
        evidence = validated;
        return observed;
      }),
    confirmArtifactUpload: async () => {
      throw new Error('Artifact upload cannot start before capture controller restoration.');
    },
  });
  const actor = createActor(logic).start();
  const cancel = (): void => {
    sendConnectorHealthEvent(actor, { type: 'COOPERATIVE_CANCEL_REQUESTED' });
  };
  input.abortSignal?.addEventListener('abort', cancel, { once: true });
  try {
    if (!sendConnectorHealthEvent(actor, { type: 'TRIGGER_ACCEPTED' })) {
      throw new Error('Connector health capture trigger was rejected.');
    }
    if (input.abortSignal?.aborted === true) {
      cancel();
    }
    await new Promise<void>((resolve) => {
      const observe = (snapshot: { status: string; value: unknown }): void => {
        if (snapshot.value === 'evidence_validated' || snapshot.status === 'done') {
          subscription.unsubscribe();
          resolve();
        }
      };
      const subscription = actor.subscribe(observe);
      observe(actor.getSnapshot());
    });
    const snapshot = actor.getSnapshot();
    if (
      snapshot.value !== 'evidence_validated' ||
      persisted === undefined ||
      evidence === undefined
    ) {
      throw new Error('Connector health capture actor failed before evidence validation.', {
        cause: effectFailure,
      });
    }
    const snapshotBytes = encodeConnectorHealthCaptureSnapshot(actor.getPersistedSnapshot());
    const persistedSnapshot = await persistRegularFileAtomically(input.snapshotPath, snapshotBytes);
    return {
      disposition: evidence.disposition,
      failureFingerprint: evidence.failureFingerprint,
      evidenceFileSha256: sha256Hex(persisted),
      captureSnapshotSha256: sha256Hex(persistedSnapshot),
      evidence,
    };
  } finally {
    input.abortSignal?.removeEventListener('abort', cancel);
    actor.stop();
  }
}
