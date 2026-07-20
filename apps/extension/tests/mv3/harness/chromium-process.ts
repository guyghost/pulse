import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

export interface ChromiumLaunchInput {
  readonly distPath: string;
  readonly headless: boolean;
  readonly profilePath: string;
}

export interface PinnedChromiumRuntimeReceipt {
  readonly browserTitle: 'Chrome for Testing';
  readonly browserVersion: '149.0.7827.55';
  readonly executableRealPath: string;
  readonly executableSha256: string;
  readonly executableVersion: 'Google Chrome for Testing 149.0.7827.55';
  readonly playwrightVersion: '1.61.1';
  readonly revision: '1228';
  readonly schemaVersion: 1;
}

export interface SpawnedProcessLike {
  readonly pid?: number;
  readonly stderr: {
    on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  };
  readonly stdout: {
    on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  };
  kill(signal: NodeJS.Signals): boolean;
  once(event: 'spawn', listener: () => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): unknown;
}

export interface OwnedChromiumExitReceipt {
  readonly code: number | null;
  readonly pid: number;
  readonly processGeneration: number;
  readonly schemaVersion: 1;
  readonly signal: NodeJS.Signals | null;
  readonly terminationMode: 'natural' | 'sigterm' | 'sigkill';
}

export interface OwnedChromiumOutputSnapshot {
  readonly stderr: string;
  readonly stdout: string;
  readonly truncated: boolean;
}

export interface OwnedChromiumTerminateOptions {
  readonly killGraceMs: number;
  readonly termGraceMs: number;
}

interface SpawnProcessOptions {
  readonly shell: false;
  readonly stdio: readonly ['ignore', 'pipe', 'pipe'];
}

export type SpawnProcess = (
  executable: string,
  args: readonly string[],
  options: SpawnProcessOptions
) => SpawnedProcessLike;

export interface LaunchOwnedChromiumInput extends ChromiumLaunchInput {
  readonly processGeneration: number;
  readonly profileRealPath: string;
  readonly runtime: PinnedChromiumRuntimeReceipt;
  readonly spawnProcess?: SpawnProcess;
}

interface PlaywrightPackageMetadata {
  readonly version?: unknown;
}

interface PlaywrightBrowserMetadata {
  readonly browsers?: unknown;
}

interface BrowserTuple {
  readonly browserVersion?: unknown;
  readonly installByDefault?: unknown;
  readonly name?: unknown;
  readonly revision?: unknown;
  readonly title?: unknown;
}

const commonLiteralArgs = Object.freeze([
  '--disable-field-trial-config',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-back-forward-cache',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-component-extensions-with-background-pages',
  '--disable-component-update',
  '--no-default-browser-check',
  '--disable-default-apps',
  '--disable-dev-shm-usage',
  '--disable-edgeupdater',
  '--disable-extensions',
  '--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion',
  '--enable-features=CDPScreenshotNewSurface',
  '--allow-pre-commit-input',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--force-color-profile=srgb',
  '--metrics-recording-only',
  '--no-first-run',
  '--password-store=basic',
  '--use-mock-keychain',
  '--no-service-autorun',
  '--export-tagged-pdf',
  '--disable-search-engine-choice-screen',
  '--unsafely-disable-devtools-self-xss-warnings',
  '--edge-skip-compat-layer-relaunch',
  '--disable-infobars',
  '--disable-sync',
  '--enable-unsafe-swiftshader',
  '--no-sandbox',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0',
] as const);

const headlessLiteralArgs = Object.freeze([
  '--headless',
  '--hide-scrollbars',
  '--mute-audio',
  '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
] as const);

function assertSealedAbsolutePath(label: string, value: string): void {
  if (
    !isAbsolute(value) ||
    value.length === 0 ||
    value.includes('\u0000') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    throw new Error(`${label} must be an absolute control-free path.`);
  }
}

function assertPositiveTimeout(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function delay(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

function redactProcessOutput(value: string): string {
  return value.replace(/ws:\/\/[^\s]*/giu, '[REDACTED_DEVTOOLS_ENDPOINT]');
}

export class OwnedChromiumProcess {
  readonly exited: Promise<OwnedChromiumExitReceipt>;
  readonly pid: number;

  readonly #process: SpawnedProcessLike;
  readonly #processGeneration: number;
  readonly #pid: number;
  readonly #resolveExited: (receipt: OwnedChromiumExitReceipt) => void;
  #stderr = '';
  #stdout = '';
  #truncated = false;
  #exitReceipt: OwnedChromiumExitReceipt | undefined;
  #terminationMode: OwnedChromiumExitReceipt['terminationMode'] = 'natural';

  constructor(process: SpawnedProcessLike, processGeneration: number, pid: number) {
    this.#process = process;
    this.#processGeneration = processGeneration;
    this.#pid = pid;
    this.pid = pid;
    let resolveExited!: (receipt: OwnedChromiumExitReceipt) => void;
    this.exited = new Promise((resolve) => {
      resolveExited = resolve;
    });
    this.#resolveExited = resolveExited;

    process.stdout.on('data', (chunk) => this.#appendOutput('stdout', chunk));
    process.stderr.on('data', (chunk) => this.#appendOutput('stderr', chunk));
    process.once('exit', (code, signal) => {
      if (this.#exitReceipt !== undefined) {
        return;
      }
      this.#exitReceipt = Object.freeze({
        code,
        pid: this.#pid,
        processGeneration: this.#processGeneration,
        schemaVersion: 1,
        signal,
        terminationMode: this.#terminationMode,
      });
      this.#resolveExited(this.#exitReceipt);
    });
  }

  outputSnapshot(): OwnedChromiumOutputSnapshot {
    return Object.freeze({
      stderr: redactProcessOutput(this.#stderr),
      stdout: redactProcessOutput(this.#stdout),
      truncated: this.#truncated,
    });
  }

  async terminate(options: OwnedChromiumTerminateOptions): Promise<OwnedChromiumExitReceipt> {
    assertPositiveTimeout('Chromium SIGTERM grace', options.termGraceMs);
    assertPositiveTimeout('Chromium SIGKILL grace', options.killGraceMs);
    if (this.#exitReceipt !== undefined) {
      return this.#exitReceipt;
    }

    this.#terminationMode = 'sigterm';
    if (!this.#process.kill('SIGTERM')) {
      throw new Error('Owned Chromium rejected SIGTERM.');
    }
    const termResult = await Promise.race([this.exited, delay(options.termGraceMs)]);
    if (termResult !== 'timeout') {
      return termResult;
    }

    this.#terminationMode = 'sigkill';
    if (!this.#process.kill('SIGKILL')) {
      throw new Error('Owned Chromium rejected SIGKILL.');
    }
    const killResult = await Promise.race([this.exited, delay(options.killGraceMs)]);
    if (killResult === 'timeout') {
      throw new Error('Owned Chromium did not exit after SIGKILL.');
    }
    return killResult;
  }

  #appendOutput(channel: 'stderr' | 'stdout', chunk: Buffer): void {
    const current = channel === 'stdout' ? this.#stdout : this.#stderr;
    if (Buffer.byteLength(current, 'utf8') >= 65_536) {
      this.#truncated = true;
      return;
    }
    const remaining = 65_536 - Buffer.byteLength(current, 'utf8');
    const incoming = chunk.toString('utf8');
    const accepted = Buffer.from(incoming, 'utf8').subarray(0, remaining).toString('utf8');
    if (Buffer.byteLength(incoming, 'utf8') > remaining) {
      this.#truncated = true;
    }
    if (channel === 'stdout') {
      this.#stdout += accepted;
    } else {
      this.#stderr += accepted;
    }
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function executableVersion(executablePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executablePath, ['--version'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (effect: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      effect();
    };
    const capture = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > 4_096) {
        finish(() => reject(new Error('Chromium version output exceeded 4096 bytes.')));
        child.kill('SIGKILL');
      }
      return next;
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = capture(stderr, chunk);
    });
    child.once('error', (error) => finish(() => reject(error)));
    child.once('exit', (code, signal) => {
      finish(() => {
        if (code !== 0 || signal !== null || stderr.trim().length > 0) {
          reject(
            new Error(
              `Chromium version preflight failed (code=${String(code)}, signal=${String(signal)}).`
            )
          );
          return;
        }
        resolve(stdout.trim());
      });
    });
    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Chromium version preflight timed out.')));
      child.kill('SIGKILL');
    }, 5_000);
  });
}

export async function admitPinnedChromiumRuntime(): Promise<PinnedChromiumRuntimeReceipt> {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('playwright-core/package.json');
  const packageRoot = dirname(packagePath);
  const packageMetadata = (await readJson(packagePath)) as PlaywrightPackageMetadata;
  if (packageMetadata.version !== '1.61.1') {
    throw new Error('Pinned playwright-core version drifted from 1.61.1.');
  }

  const browsersMetadata = (await readJson(
    join(packageRoot, 'browsers.json')
  )) as PlaywrightBrowserMetadata;
  if (!Array.isArray(browsersMetadata.browsers)) {
    throw new Error('Pinned Playwright browsers.json is malformed.');
  }
  const chromiumEntries = browsersMetadata.browsers.filter(
    (entry): entry is BrowserTuple => isRecord(entry) && entry.name === 'chromium'
  );
  if (chromiumEntries.length !== 1) {
    throw new Error('Pinned Playwright metadata must contain exactly one Chromium tuple.');
  }
  const tuple = chromiumEntries[0]!;
  if (
    tuple.revision !== '1228' ||
    tuple.browserVersion !== '149.0.7827.55' ||
    tuple.title !== 'Chrome for Testing' ||
    tuple.installByDefault !== true
  ) {
    throw new Error('Pinned Chromium tuple drifted from revision 1228 / 149.0.7827.55.');
  }

  const executablePath = chromium.executablePath();
  const executableStat = await lstat(executablePath);
  if (!executableStat.isFile() || executableStat.isSymbolicLink()) {
    throw new Error('Pinned Chromium executable must be a regular non-symlink file.');
  }
  await access(executablePath, constants.X_OK);
  const executableRealPath = await realpath(executablePath);
  if (!executableRealPath.includes(`${sep}chromium-1228${sep}`)) {
    throw new Error('Pinned Chromium executable is outside the revision-1228 cache directory.');
  }
  const version = await executableVersion(executableRealPath);
  if (version !== 'Google Chrome for Testing 149.0.7827.55') {
    throw new Error('Pinned Chromium executable version output drifted.');
  }

  return Object.freeze({
    browserTitle: 'Chrome for Testing',
    browserVersion: '149.0.7827.55',
    executableRealPath,
    executableSha256: await sha256File(executableRealPath),
    executableVersion: 'Google Chrome for Testing 149.0.7827.55',
    playwrightVersion: '1.61.1',
    revision: '1228',
    schemaVersion: 1,
  });
}

const defaultSpawnProcess: SpawnProcess = (executable, args, options) =>
  spawn(executable, [...args], options) as unknown as SpawnedProcessLike;

export async function launchOwnedChromiumProcess(
  input: LaunchOwnedChromiumInput
): Promise<OwnedChromiumProcess> {
  if (!Number.isSafeInteger(input.processGeneration) || input.processGeneration < 1) {
    throw new Error('Owned Chromium process generation must be a positive safe integer.');
  }
  assertSealedAbsolutePath('Chromium real profile', input.profileRealPath);
  if (input.profileRealPath !== input.profilePath) {
    throw new Error('Owned Chromium profile path must equal its frozen real path.');
  }
  const args = buildChromiumLaunchArgs(input);
  const process = (input.spawnProcess ?? defaultSpawnProcess)(
    input.runtime.executableRealPath,
    args,
    { shell: false, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  await new Promise<void>((resolve, reject) => {
    process.once('spawn', resolve);
    process.once('error', reject);
  });
  if (!Number.isSafeInteger(process.pid) || (process.pid ?? 0) < 1) {
    process.kill('SIGKILL');
    throw new Error('Owned Chromium did not expose a valid PID after spawn.');
  }
  return new OwnedChromiumProcess(process, input.processGeneration, process.pid!);
}

export function buildChromiumLaunchArgs(input: ChromiumLaunchInput): readonly string[] {
  assertSealedAbsolutePath('Chromium profile', input.profilePath);
  assertSealedAbsolutePath('Packaged extension', input.distPath);

  return Object.freeze([
    ...commonLiteralArgs,
    `--user-data-dir=${input.profilePath}`,
    `--disable-extensions-except=${input.distPath}`,
    `--load-extension=${input.distPath}`,
    '--window-size=420,900',
    ...(input.headless ? headlessLiteralArgs : []),
    'about:blank',
  ]);
}
