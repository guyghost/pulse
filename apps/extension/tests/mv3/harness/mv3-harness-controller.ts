import { chromium, type Page } from '@playwright/test';
import { access, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createActor, type ActorRefFrom } from 'xstate';

import {
  admitPinnedChromiumRuntime,
  launchOwnedChromiumProcess,
  type OwnedChromiumProcess,
} from './chromium-process';
import type { RestartReceiptV1 } from './contracts';
import { parseRestartReceiptV1 } from './contracts';
import { waitForDevToolsEndpoint, type DevToolsEndpointIdentity } from './devtools-endpoint';
import { mv3HarnessMachine } from './mv3-harness.machine';
import {
  projectPlaywrightAuthorityV1,
  sha256Jcs,
  type NoOwnerReleaseReceiptV1,
  type PlaywrightAuthorityProjectionErrorV1,
  type PlaywrightAuthorityV1,
} from './playwright-authority';
import {
  acquirePlaywrightOwner,
  type BrowserPort,
  type PagePort,
  type PlaywrightConnectPort,
  type PlaywrightDiagnostic,
  type PlaywrightOwner,
} from './playwright-owner';
import { openRawCdpLease, type BrowserVersionReceipt } from './raw-cdp-lease';
import {
  createRawBootstrapRetentionAckV1,
  parseRawBootstrapProvedV1,
  type RawBootstrapProvedV1,
  type RawBootstrapRetentionAckV1,
} from './raw-operational-authority';
import {
  runRawWorkerEpoch,
  type RawWorkerAuthority,
  type RawWorkerEpochResult,
} from './raw-worker-owner';
import { openTrackedCdpTransport, type TrackedSocketLike } from './tracked-cdp-transport';

export const MV3_TEST_TIMEOUT_MS = 240_000;
export const MV3_HARNESS_GLOBAL_DEADLINE_MS = 210_000;

const PROCESS_STARTUP_TIMEOUT_MS = 15_000;
const RAW_OPERATION_TIMEOUT_MS = 20_000;
const RAW_RELEASE_TIMEOUT_MS = 5_000;
const PLAYWRIGHT_HANDOFF_TIMEOUT_MS = 15_000;
const PLAYWRIGHT_RELEASE_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const TERM_GRACE_MS = 2_000;
const KILL_GRACE_MS = 2_000;

export type HarnessActor = ActorRefFrom<typeof mv3HarnessMachine>;

export interface ControllerManifest {
  readonly background?: { readonly service_worker?: string };
  readonly side_panel?: { readonly default_path?: string };
}

export interface DetachedWorkerIdentity {
  readonly workerUrl: string;
  url(): string;
}

export interface StartMv3HarnessControllerOptions {
  readonly artifactSha256: string;
  readonly distPath: string;
  readonly headless: boolean;
  readonly manifest: ControllerManifest;
  readonly onPlaywrightDiagnostic: (diagnostic: PlaywrightDiagnostic) => void;
  readonly onProtocolFailure: (error: Error) => void;
  readonly profileRoot: string;
}

export interface FinishMv3HarnessControllerOptions {
  readonly artifactAfterSha256: string;
  readonly diagnosticsAccepted: boolean;
}

interface PlaywrightEpoch {
  readonly leaseEpoch: number;
  readonly owner: PlaywrightOwner;
  readonly playwrightEpoch: number;
}

interface RawEpochAuthority {
  readonly authority: RawWorkerAuthority;
  readonly browserVersion: BrowserVersionReceipt;
  readonly browserVersionSha256: string;
  readonly rawReceiptSha256: string;
  readonly result: RawWorkerEpochResult;
}

export interface ProjectedPlaywrightReservation {
  readonly authority: PlaywrightAuthorityV1;
  readonly authorityProjectionSha256: string;
}

export class PlaywrightAuthorityProjectionRejectedError extends Error {
  readonly projectionError: PlaywrightAuthorityProjectionErrorV1;
  readonly noOwnerReleaseReceipt: NoOwnerReleaseReceiptV1;

  constructor(
    projectionError: PlaywrightAuthorityProjectionErrorV1,
    noOwnerReleaseReceipt: NoOwnerReleaseReceiptV1
  ) {
    super(`Playwright authority projection rejected: ${projectionError.code}.`);
    this.name = 'PlaywrightAuthorityProjectionRejectedError';
    this.projectionError = projectionError;
    this.noOwnerReleaseReceipt = noOwnerReleaseReceipt;
  }
}

function asTrackedSocket(endpointUrl: string): TrackedSocketLike {
  return new WebSocket(endpointUrl) as unknown as TrackedSocketLike;
}

const playwrightConnect: PlaywrightConnectPort = {
  connectOverCDP: async (transport, options) =>
    (await chromium.connectOverCDP(transport, options)) as unknown as BrowserPort,
};

function assertExactWorkerPath(value: string | undefined): string {
  if (
    value === undefined ||
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('?') ||
    value.includes('#') ||
    /[\0\r\n]/u.test(value)
  ) {
    throw new Error('Packaged manifest background service-worker path is invalid.');
  }
  return `/${value}`;
}

function assertSidePanelPath(value: string | undefined): string {
  if (
    value === undefined ||
    value.length === 0 ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value) ||
    /[\0\r\n]/u.test(value)
  ) {
    throw new Error('Packaged manifest side-panel path is invalid.');
  }
  return value.replace(/^\/+/, '');
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} is not a SHA-256 digest.`);
  }
}

function actorState(actor: HarnessActor): string {
  return JSON.stringify(actor.getSnapshot().value);
}

function requireState(actor: HarnessActor, expected: string): void {
  if (!actor.getSnapshot().matches(expected as never)) {
    throw new Error(`MV3 harness expected ${expected}, observed ${actorState(actor)}.`);
  }
}

export function createRawBootstrapRetentionHandler(input: {
  readonly actor: HarnessActor;
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly mode: 'initial_bootstrap' | 'runtime_restart';
  readonly transportId: string;
}): (proof: RawBootstrapProvedV1) => RawBootstrapRetentionAckV1 {
  let consumed = false;
  return (value) => {
    if (consumed) {
      throw new Error('Raw bootstrap proof callback cannot be invoked more than once.');
    }
    consumed = true;
    const proof = parseRawBootstrapProvedV1(value);
    if (
      proof === null ||
      proof.processGeneration !== input.processGeneration ||
      proof.leaseEpoch !== input.leaseEpoch ||
      proof.transportId !== input.transportId
    ) {
      throw new Error('Raw bootstrap proof callback identity is stale.');
    }
    requireState(input.actor, `raw_owned.${input.mode}`);
    const before = input.actor.getSnapshot().context;
    if (
      before.processGeneration !== input.processGeneration ||
      before.currentLeaseEpoch !== input.leaseEpoch ||
      before.rawTransportId !== input.transportId ||
      !before.rawTransportOpened
    ) {
      throw new Error('Raw bootstrap proof callback arrived outside its live lease.');
    }
    input.actor.send({
      type: 'RAW_BOOTSTRAP_PROVED',
      processGeneration: proof.processGeneration,
      leaseEpoch: proof.leaseEpoch,
      receiptSha256: proof.receiptSha256,
      operationalCommandCount: proof.operationalCommandCount,
      operationalLedgerSha256: proof.operationalLedgerSha256,
    });
    requireState(input.actor, `raw_releasing.${input.mode}`);
    const retained = input.actor.getSnapshot().context;
    if (
      retained.currentRawBootstrapReceiptSha256 !== proof.receiptSha256 ||
      retained.currentRawOperationalCommandCount !== proof.operationalCommandCount ||
      retained.currentRawOperationalLedgerSha256 !== proof.operationalLedgerSha256
    ) {
      throw new Error('Raw bootstrap proof was not retained atomically.');
    }
    return createRawBootstrapRetentionAckV1(proof);
  };
}

export async function withProjectedPlaywrightReservation<T>(
  input: {
    readonly actor: HarnessActor;
    readonly processGeneration: number;
    readonly leaseEpoch: number;
    readonly playwrightEpoch: number;
    readonly rawReceiptSha256: string;
  },
  acquire: (reservation: ProjectedPlaywrightReservation) => Promise<T>
): Promise<T> {
  input.actor.send({
    type: 'PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED',
    processGeneration: input.processGeneration,
    playwrightEpoch: input.playwrightEpoch,
    rawReceiptSha256: input.rawReceiptSha256,
  });
  requireState(input.actor, 'playwright_authority_projecting');

  const projection = projectPlaywrightAuthorityV1(
    input.actor.getSnapshot().context.currentRawAuthority
  );
  if (!projection.ok) {
    input.actor.send({
      type: 'PLAYWRIGHT_AUTHORITY_REJECTED',
      processGeneration: input.processGeneration,
      playwrightEpoch: input.playwrightEpoch,
      rawReceiptSha256: input.rawReceiptSha256,
      error: projection.error,
    });
    requireState(input.actor, 'failed_shutdown_connecting');
    const noOwnerReleaseReceipt = input.actor.getSnapshot().context.noOwnerReleaseReceipt;
    if (noOwnerReleaseReceipt === null) {
      throw new Error('Projection rejection did not retain a no-owner release receipt.');
    }
    throw new PlaywrightAuthorityProjectionRejectedError(projection.error, noOwnerReleaseReceipt);
  }

  input.actor.send({
    type: 'PLAYWRIGHT_AUTHORITY_PROJECTED',
    processGeneration: input.processGeneration,
    playwrightEpoch: input.playwrightEpoch,
    rawReceiptSha256: input.rawReceiptSha256,
    authority: projection.authority,
    authorityProjectionSha256: projection.authorityProjectionSha256,
  });
  requireState(input.actor, 'playwright_authority_ready');
  const snapshot = input.actor.getSnapshot();
  const authority = snapshot.context.currentPlaywrightAuthority;
  const authorityProjectionSha256 = snapshot.context.authorityProjectionSha256;
  if (authority === null || authorityProjectionSha256 === null) {
    throw new Error('Ready projection did not retain its private authority DTO.');
  }
  const reservation = Object.freeze({ authority, authorityProjectionSha256 });
  input.actor.send({
    type: 'PLAYWRIGHT_RESERVE_REQUESTED',
    processGeneration: input.processGeneration,
    leaseEpoch: input.leaseEpoch,
    playwrightEpoch: input.playwrightEpoch,
    authorityProjectionSha256,
  });
  requireState(input.actor, 'playwright_connecting');
  return acquire(reservation);
}

function detachedWorker(workerUrl: string): DetachedWorkerIdentity {
  const value = {
    workerUrl,
    url: () => workerUrl,
  };
  return Object.freeze(value);
}

export class Mv3HarnessController {
  readonly extensionId: string;
  readonly sidePanelUrl: string;

  readonly #actor: HarnessActor;
  readonly #artifactSha256: string;
  readonly #endpoint: DevToolsEndpointIdentity;
  readonly #expectedWorkerPath: string;
  readonly #onPlaywrightDiagnostic: (diagnostic: PlaywrightDiagnostic) => void;
  readonly #onProtocolFailure: (error: Error) => void;
  readonly #process: OwnedChromiumProcess;
  readonly #processGeneration = 1;
  readonly #profilePath: string;
  readonly #startedAt = performance.now();

  #authority: RawEpochAuthority;
  #currentPlaywright: PlaywrightEpoch;
  #leaseEpoch = 0;
  #playwrightEpoch = 0;
  #restartCount = 0;
  #restartReceipt: RestartReceiptV1;
  #closed = false;
  #transitionInProgress = false;

  private constructor(input: {
    actor: HarnessActor;
    artifactSha256: string;
    authority: RawEpochAuthority;
    currentPlaywright: PlaywrightEpoch;
    endpoint: DevToolsEndpointIdentity;
    expectedWorkerPath: string;
    onPlaywrightDiagnostic: (diagnostic: PlaywrightDiagnostic) => void;
    onProtocolFailure: (error: Error) => void;
    process: OwnedChromiumProcess;
    profilePath: string;
    sidePanelPath: string;
  }) {
    this.#actor = input.actor;
    this.#artifactSha256 = input.artifactSha256;
    this.#authority = input.authority;
    this.#currentPlaywright = input.currentPlaywright;
    this.#endpoint = input.endpoint;
    this.#expectedWorkerPath = input.expectedWorkerPath;
    this.#onPlaywrightDiagnostic = input.onPlaywrightDiagnostic;
    this.#onProtocolFailure = input.onProtocolFailure;
    this.#process = input.process;
    this.#profilePath = input.profilePath;
    this.#leaseEpoch = input.currentPlaywright.leaseEpoch;
    this.#playwrightEpoch = input.currentPlaywright.playwrightEpoch;
    this.#restartReceipt = input.authority.result.restartReceipt;
    this.extensionId = input.authority.authority.extensionId;
    this.sidePanelUrl = `chrome-extension://${this.extensionId}/${input.sidePanelPath}`;
  }

  static async start(options: StartMv3HarnessControllerOptions): Promise<Mv3HarnessController> {
    assertSha256(options.artifactSha256, 'Packaged artifact receipt');
    const expectedWorkerPath = assertExactWorkerPath(options.manifest.background?.service_worker);
    const sidePanelPath = assertSidePanelPath(options.manifest.side_panel?.default_path);
    await mkdir(options.profileRoot, { recursive: true });
    const profilePath = await realpath(await mkdtemp(join(options.profileRoot, 'mv3-owned-')));
    const actor = createActor(mv3HarnessMachine);
    actor.start();
    actor.send({ type: 'HARNESS_STARTED' });
    actor.send({ type: 'ARTIFACT_SEALED', artifactSha256: options.artifactSha256 });
    actor.send({ type: 'PROFILE_CREATED', profileId: basename(profilePath) });

    let process: OwnedChromiumProcess | undefined;
    try {
      await access(join(profilePath, 'DevToolsActivePort')).then(
        () => {
          throw new Error('Fresh MV3 profile already contains DevToolsActivePort.');
        },
        () => undefined
      );
      const runtime = await admitPinnedChromiumRuntime();
      process = await launchOwnedChromiumProcess({
        distPath: options.distPath,
        headless: options.headless,
        processGeneration: 1,
        profilePath,
        profileRealPath: profilePath,
        runtime,
      });
      actor.send({
        type: 'PROCESS_SPAWNED',
        processGeneration: 1,
        pid: process.pid,
      });
      const endpoint = await waitForDevToolsEndpoint({
        childExited: process.exited,
        endpointPath: join(profilePath, 'DevToolsActivePort'),
        pollIntervalMs: 25,
        processGeneration: 1,
        profileRealPath: profilePath,
        timeoutMs: PROCESS_STARTUP_TIMEOUT_MS,
      });
      actor.send({
        type: 'ENDPOINT_PARSED',
        processGeneration: 1,
        endpointReceiptSha256: endpoint.endpointSha256,
      });
      requireState(actor, 'owner_none');

      let leaseEpoch = 1;
      const authority = await Mv3HarnessController.#runRawEpoch({
        actor,
        endpoint,
        expectedWorkerPath,
        leaseEpoch,
        mode: 'initial_bootstrap',
        onApplicationDiagnostic: options.onPlaywrightDiagnostic,
        playwrightEpoch: 1,
        process,
        restartGeneration: 0,
      });
      leaseEpoch += 1;
      const currentPlaywright = await Mv3HarnessController.#acquirePlaywright({
        actor,
        authority,
        endpoint,
        leaseEpoch,
        onPlaywrightDiagnostic: options.onPlaywrightDiagnostic,
        onProtocolFailure: options.onProtocolFailure,
        playwrightEpoch: 1,
        process,
      });
      return new Mv3HarnessController({
        actor,
        artifactSha256: options.artifactSha256,
        authority,
        currentPlaywright,
        endpoint,
        expectedWorkerPath,
        onPlaywrightDiagnostic: options.onPlaywrightDiagnostic,
        onProtocolFailure: options.onProtocolFailure,
        process,
        profilePath,
        sidePanelPath,
      });
    } catch (error) {
      actor.stop();
      if (process !== undefined) {
        await process
          .terminate({ termGraceMs: TERM_GRACE_MS, killGraceMs: KILL_GRACE_MS })
          .catch(() => undefined);
      }
      await rm(profilePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      throw error;
    }
  }

  get restartReceipt(): RestartReceiptV1 {
    return this.#restartReceipt;
  }

  currentWorker(): DetachedWorkerIdentity {
    this.#assertUsable();
    return detachedWorker(this.#authority.authority.scriptURL);
  }

  async openSidePanel(): Promise<Page> {
    this.#assertUsable();
    return (await this.#currentPlaywright.owner.facade.openFixturePage(
      this.sidePanelUrl
    )) as unknown as Page;
  }

  async evaluateInServiceWorker<T>(expression: string): Promise<T> {
    this.#assertUsable();
    return (await this.#currentPlaywright.owner.facade.evaluateInServiceWorker(expression)) as T;
  }

  async seedStorage(values: Readonly<Record<string, unknown>>): Promise<void> {
    const serialized = JSON.stringify(values);
    const confirmed = await this.evaluateInServiceWorker<boolean>(
      `chrome.storage.local.set(${serialized}).then(() => true)`
    );
    if (confirmed !== true) {
      throw new Error('Service-worker storage seed was not confirmed.');
    }
  }

  async restartServiceWorkerForProbe(probeExpression?: string): Promise<RestartReceiptV1> {
    this.#beginTransition();
    try {
      if (this.#restartCount >= 1) {
        throw new Error('MV3 harness permits exactly one runtime restart.');
      }
      this.#actor.send({
        type: 'RESTART_REQUESTED',
        processGeneration: this.#processGeneration,
        playwrightEpoch: this.#playwrightEpoch,
      });
      requireState(this.#actor, 'playwright_releasing.restart');
      await this.#currentPlaywright.owner.release();
      this.#actor.send({
        type: 'PLAYWRIGHT_RELEASE_PROVED',
        processGeneration: this.#processGeneration,
        leaseEpoch: this.#currentPlaywright.leaseEpoch,
        playwrightEpoch: this.#currentPlaywright.playwrightEpoch,
      });
      requireState(this.#actor, 'owner_none');

      const nextPlaywrightEpoch = this.#playwrightEpoch + 1;
      const raw = await Mv3HarnessController.#runRawEpoch({
        actor: this.#actor,
        endpoint: this.#endpoint,
        expectedWorkerPath: this.#expectedWorkerPath,
        leaseEpoch: ++this.#leaseEpoch,
        mode: 'runtime_restart',
        onApplicationDiagnostic: this.#onPlaywrightDiagnostic,
        playwrightEpoch: nextPlaywrightEpoch,
        probeExpression,
        process: this.#process,
        restartGeneration: this.#restartReceipt.restartGeneration,
      });
      if (
        raw.authority.extensionId !== this.extensionId ||
        raw.authority.registrationId !== this.#authority.authority.registrationId ||
        raw.authority.versionId !== this.#authority.authority.versionId ||
        raw.authority.scriptURL !== this.#authority.authority.scriptURL ||
        raw.browserVersionSha256 !== this.#authority.browserVersionSha256
      ) {
        throw new Error('MV3 runtime restart changed process or worker authority.');
      }
      const owner = await Mv3HarnessController.#acquirePlaywright({
        actor: this.#actor,
        authority: raw,
        endpoint: this.#endpoint,
        leaseEpoch: ++this.#leaseEpoch,
        onPlaywrightDiagnostic: this.#onPlaywrightDiagnostic,
        onProtocolFailure: this.#onProtocolFailure,
        playwrightEpoch: nextPlaywrightEpoch,
        process: this.#process,
      });
      this.#authority = raw;
      this.#currentPlaywright = owner;
      this.#playwrightEpoch = nextPlaywrightEpoch;
      this.#restartReceipt = raw.result.restartReceipt;
      this.#restartCount += 1;
      return this.#restartReceipt;
    } finally {
      this.#transitionInProgress = false;
    }
  }

  async evaluateInRestartedServiceWorker<T>(
    receipt: RestartReceiptV1,
    expression: string
  ): Promise<T> {
    parseRestartReceiptV1(receipt, { expectedCurrentReceipt: this.#restartReceipt });
    if (receipt.playwrightEpoch !== this.#playwrightEpoch || this.#restartCount !== 1) {
      throw new Error('Restart receipt does not belong to the current Playwright epoch.');
    }
    return this.evaluateInServiceWorker<T>(expression);
  }

  async finish(options: FinishMv3HarnessControllerOptions): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#beginTransition();
    try {
      this.#actor.send({
        type: 'USE_COMPLETED',
        processGeneration: this.#processGeneration,
        playwrightEpoch: this.#playwrightEpoch,
      });
      requireState(this.#actor, 'diagnostics_settling');
      this.#actor.send({
        type: options.diagnosticsAccepted ? 'DIAGNOSTICS_ACCEPTED' : 'DIAGNOSTICS_REJECTED',
        processGeneration: this.#processGeneration,
      });
      if (!options.diagnosticsAccepted) {
        throw new Error('MV3 harness runtime diagnostics rejected the candidate.');
      }
      requireState(this.#actor, 'artifact_reverifying');
      if (options.artifactAfterSha256 !== this.#artifactSha256) {
        this.#actor.send({
          type: 'ARTIFACT_CHANGED',
          processGeneration: this.#processGeneration,
        });
        throw new Error('Packaged MV3 artifact changed during the browser test.');
      }
      this.#actor.send({
        type: 'ARTIFACT_MATCHED',
        processGeneration: this.#processGeneration,
        artifactSha256: options.artifactAfterSha256,
      });
      requireState(this.#actor, 'playwright_releasing.final');
      await this.#currentPlaywright.owner.release();
      this.#actor.send({
        type: 'PLAYWRIGHT_RELEASE_PROVED',
        processGeneration: this.#processGeneration,
        leaseEpoch: this.#currentPlaywright.leaseEpoch,
        playwrightEpoch: this.#currentPlaywright.playwrightEpoch,
      });
      requireState(this.#actor, 'shutdown_connecting');
      await this.#shutdownNormally();
      this.#closed = true;
    } finally {
      this.#transitionInProgress = false;
    }
  }

  async abort(): Promise<void> {
    if (this.#closed) {
      return;
    }
    const errors: unknown[] = [];
    await this.#currentPlaywright.owner.release().catch((error) => errors.push(error));
    await this.#process
      .terminate({ termGraceMs: TERM_GRACE_MS, killGraceMs: KILL_GRACE_MS })
      .catch((error) => errors.push(error));
    await rm(this.#profilePath, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    }).catch((error) => errors.push(error));
    this.#actor.stop();
    this.#closed = true;
    if (errors.length > 0) {
      throw new AggregateError(errors, 'MV3 harness abort cleanup failed.');
    }
  }

  static async #runRawEpoch(input: {
    readonly actor: HarnessActor;
    readonly endpoint: DevToolsEndpointIdentity;
    readonly expectedWorkerPath: string;
    readonly leaseEpoch: number;
    readonly mode: 'initial_bootstrap' | 'runtime_restart';
    readonly onApplicationDiagnostic: (diagnostic: PlaywrightDiagnostic) => void;
    readonly playwrightEpoch: number;
    readonly probeExpression?: string;
    readonly process: OwnedChromiumProcess;
    readonly restartGeneration: number;
  }): Promise<RawEpochAuthority> {
    const transportId = `raw-${input.endpoint.processGeneration}-${input.leaseEpoch}`;
    input.actor.send({
      type: 'RAW_ACQUIRE_REQUESTED',
      processGeneration: input.endpoint.processGeneration,
      leaseEpoch: input.leaseEpoch,
      mode: input.mode,
    });
    const lease = await openRawCdpLease({
      childExited: input.process.exited,
      endpointUrl: input.endpoint.webSocketUrl,
      leaseEpoch: input.leaseEpoch,
      openTimeoutMs: RAW_OPERATION_TIMEOUT_MS,
      processGeneration: input.endpoint.processGeneration,
      transportId,
    });
    input.actor.send({
      type: 'RAW_TRANSPORT_OPENED',
      processGeneration: input.endpoint.processGeneration,
      leaseEpoch: input.leaseEpoch,
      transportId,
    });
    input.actor.send({
      type: 'ENDPOINT_VERIFIED',
      processGeneration: input.endpoint.processGeneration,
      leaseEpoch: input.leaseEpoch,
      endpointReceiptSha256: lease.browserVersionSha256,
    });
    const onBootstrapProved = createRawBootstrapRetentionHandler({
      actor: input.actor,
      processGeneration: input.endpoint.processGeneration,
      leaseEpoch: input.leaseEpoch,
      mode: input.mode,
      transportId,
    });
    const result = await runRawWorkerEpoch({
      client: lease.client,
      expectedWorkerPath: input.expectedWorkerPath,
      leaseEpoch: input.leaseEpoch,
      operationTimeoutMs: RAW_OPERATION_TIMEOUT_MS,
      onBootstrapProved,
      playwrightEpoch: input.playwrightEpoch,
      processGeneration: input.endpoint.processGeneration,
      releaseTimeoutMs: RAW_RELEASE_TIMEOUT_MS,
      restartGeneration: input.restartGeneration,
      transportId,
      ...(input.probeExpression === undefined ? {} : { probeExpression: input.probeExpression }),
    });
    if (lease.diagnostics.length > 0) {
      throw new Error('Raw CDP lease retained protocol diagnostics.');
    }
    for (const diagnostic of result.applicationDiagnostics) {
      input.onApplicationDiagnostic(
        Object.freeze({
          method:
            diagnostic.kind === 'probe.exceptionDetails'
              ? 'Runtime.exceptionThrown'
              : diagnostic.kind,
          params: Object.freeze({ message: diagnostic.message }),
          playwrightEpoch: input.playwrightEpoch,
          processGeneration: input.endpoint.processGeneration,
        })
      );
    }
    const rawReceiptSha256 = sha256Jcs(result.releaseReceipt);
    input.actor.send({
      type: 'RAW_RELEASE_PROVED',
      processGeneration: input.endpoint.processGeneration,
      leaseEpoch: input.leaseEpoch,
      playwrightEpoch: input.playwrightEpoch,
      rawReceipt: result.releaseReceipt,
      rawReceiptSha256,
      authority: result.authority,
    });
    requireState(input.actor, 'owner_none');
    return Object.freeze({
      authority: result.authority,
      browserVersion: lease.browserVersion,
      browserVersionSha256: lease.browserVersionSha256,
      rawReceiptSha256,
      result,
    });
  }

  static async #acquirePlaywright(input: {
    readonly actor: HarnessActor;
    readonly authority: RawEpochAuthority;
    readonly endpoint: DevToolsEndpointIdentity;
    readonly leaseEpoch: number;
    readonly onPlaywrightDiagnostic: (diagnostic: PlaywrightDiagnostic) => void;
    readonly onProtocolFailure: (error: Error) => void;
    readonly playwrightEpoch: number;
    readonly process: OwnedChromiumProcess;
  }): Promise<PlaywrightEpoch> {
    return withProjectedPlaywrightReservation(
      {
        actor: input.actor,
        processGeneration: input.endpoint.processGeneration,
        leaseEpoch: input.leaseEpoch,
        playwrightEpoch: input.playwrightEpoch,
        rawReceiptSha256: input.authority.rawReceiptSha256,
      },
      async ({ authority }) => {
        const transportId = `playwright-${input.endpoint.processGeneration}-${input.leaseEpoch}`;
        const transport = await openTrackedCdpTransport({
          createSocket: asTrackedSocket,
          endpointUrl: input.endpoint.webSocketUrl,
          identity: {
            processGeneration: input.endpoint.processGeneration,
            leaseEpoch: input.leaseEpoch,
            transportId,
          },
          maxInboundMessageBytes: 1_048_576,
          onProtocolFailure: input.onProtocolFailure,
          openTimeoutMs: PLAYWRIGHT_HANDOFF_TIMEOUT_MS,
        });
        input.actor.send({
          type: 'PLAYWRIGHT_TRANSPORT_OPENED',
          processGeneration: input.endpoint.processGeneration,
          leaseEpoch: input.leaseEpoch,
          playwrightEpoch: input.playwrightEpoch,
          transportId,
        });
        const owner = await acquirePlaywrightOwner({
          authority,
          browserVersion: input.authority.browserVersion,
          connect: playwrightConnect,
          handoffTimeoutMs: PLAYWRIGHT_HANDOFF_TIMEOUT_MS,
          leaseEpoch: input.leaseEpoch,
          onDiagnostic: input.onPlaywrightDiagnostic,
          onProtocolFailure: input.onProtocolFailure,
          playwrightEpoch: input.playwrightEpoch,
          processGeneration: input.endpoint.processGeneration,
          releaseTimeoutMs: PLAYWRIGHT_RELEASE_TIMEOUT_MS,
          transport,
        });
        input.actor.send({
          type: 'PLAYWRIGHT_HANDOFF_PROVED',
          processGeneration: input.endpoint.processGeneration,
          leaseEpoch: input.leaseEpoch,
          playwrightEpoch: input.playwrightEpoch,
        });
        requireState(input.actor, 'playwright_owned.exercising');
        return Object.freeze({
          leaseEpoch: input.leaseEpoch,
          owner,
          playwrightEpoch: input.playwrightEpoch,
        });
      }
    );
  }

  async #shutdownNormally(): Promise<void> {
    const leaseEpoch = ++this.#leaseEpoch;
    const transportId = `shutdown-${this.#processGeneration}-${leaseEpoch}`;
    this.#actor.send({
      type: 'SHUTDOWN_TRANSPORT_OPENED',
      processGeneration: this.#processGeneration,
      leaseEpoch,
      transportId,
    });
    const lease = await openRawCdpLease({
      childExited: this.#process.exited,
      endpointUrl: this.#endpoint.webSocketUrl,
      leaseEpoch,
      openTimeoutMs: SHUTDOWN_TIMEOUT_MS,
      processGeneration: this.#processGeneration,
      transportId,
    });
    const commandId = '2';
    this.#actor.send({
      type: 'SHUTDOWN_ENDPOINT_VERIFIED',
      processGeneration: this.#processGeneration,
      leaseEpoch,
      transportId,
      commandId,
    });
    requireState(this.#actor, 'shutdown_owned');
    const dispatchedAt = performance.now();
    const closeCommand = lease.client.sendCleanupCommand({ method: 'Browser.close', params: {} });
    lease.client.expectRemoteClose();
    const proof = await Promise.race([
      closeCommand.then(
        (receipt) => ({ kind: 'response' as const, receipt }),
        () => ({ kind: 'socket' as const, closedAt: performance.now() })
      ),
      lease.client.closed.then(() => ({ kind: 'socket' as const, closedAt: performance.now() })),
    ]);
    if (proof.kind === 'response') {
      if (String(proof.receipt.id) !== commandId) {
        throw new Error('Browser.close command identity diverged.');
      }
      this.#actor.send({
        type: 'SHUTDOWN_BROWSER_CLOSE_RESOLVED',
        processGeneration: this.#processGeneration,
        leaseEpoch,
        transportId,
        commandId,
        resolvedAt: performance.now(),
      });
    } else {
      this.#actor.send({
        type: 'SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND',
        processGeneration: this.#processGeneration,
        leaseEpoch,
        transportId,
        commandId,
        dispatchedAt,
        socketClosedAt: proof.closedAt,
      });
    }
    const exit = await this.#process.exited;
    this.#actor.send({
      type: 'PROCESS_EXITED',
      processGeneration: this.#processGeneration,
      pid: exit.pid,
      observedAt: performance.now(),
    });
    requireState(this.#actor, 'profile_removing');
    await rm(this.#profilePath, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    this.#actor.send({ type: 'PROFILE_REMOVED', processGeneration: this.#processGeneration });
    requireState(this.#actor, 'passed');
    this.#actor.send({ type: 'VERDICT_ARCHIVED', processGeneration: this.#processGeneration });
    requireState(this.#actor, 'archived');
    this.#actor.stop();
  }

  #assertUsable(): void {
    if (this.#closed || this.#transitionInProgress) {
      throw new Error('MV3 harness fixture capability is not available in this phase.');
    }
    if (performance.now() - this.#startedAt > MV3_HARNESS_GLOBAL_DEADLINE_MS) {
      throw new Error('MV3 harness exceeded its global monotonic deadline.');
    }
  }

  #beginTransition(): void {
    this.#assertUsable();
    this.#transitionInProgress = true;
  }
}

export function asPagePort(page: Page): PagePort {
  return page;
}
