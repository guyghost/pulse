import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  RELEASE_RUNTIME_CONTRACT,
  ReleaseRuntimeContractError,
  createIsolatedPythonInvocation,
  deriveIsolatedDockerInvocationPolicySha256,
  prepareIsolatedDockerRun,
} from '../../../scripts/release-runtime/contract';

const INDEX_SHA256 = '8'.repeat(64);
const MANIFEST_SHA256 = '9'.repeat(64);
const CONFIG_SHA256 = 'a'.repeat(64);
const LAYER_SHA256 = ['b'.repeat(64)];
const DIFF_ID_SHA256 = ['c'.repeat(64)];
const EXECUTION_REFERENCE = `missionpulse-release-runtime@sha256:${MANIFEST_SHA256}`;
const CONTROLLER_BUNDLE_SHA256 = createHash('sha256').update('export {};\n').digest('hex');
const CANDIDATE_MANIFEST = '{}';
const CANDIDATE_MANIFEST_SHA256 = createHash('sha256').update(CANDIDATE_MANIFEST).digest('hex');
const CANDIDATE_ARTIFACT_TREE = Object.freeze({
  algorithm: 'missionpulse-tree-sha256-v2' as const,
  fileCount: 1,
  treeSha256: createHash('sha256')
    .update(
      `manifest.json\0${String(Buffer.byteLength(CANDIDATE_MANIFEST))}\0${CANDIDATE_MANIFEST_SHA256}\n`
    )
    .digest('hex'),
  manifestSha256: CANDIDATE_MANIFEST_SHA256,
  entries: Object.freeze([
    Object.freeze({
      path: 'manifest.json',
      bytes: Buffer.byteLength(CANDIDATE_MANIFEST),
      sha256: CANDIDATE_MANIFEST_SHA256,
      mode: '0644' as const,
    }),
  ]),
});

function startedDockerRun(completion: Promise<void> = Promise.resolve()) {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {
    stdio: 'ignore',
  });
  return Object.freeze({
    child,
    completion: completion.finally(() => {
      child.kill('SIGKILL');
    }),
  });
}

function verifiedExecutionImage() {
  return {
    schema: 'missionpulse.verified-execution-image-authority' as const,
    version: 1 as const,
    platform: 'linux/amd64' as const,
    indexSha256: INDEX_SHA256,
    manifestSha256: MANIFEST_SHA256,
    configSha256: CONFIG_SHA256,
    layerSha256: LAYER_SHA256,
    diffIdSha256: DIFF_ID_SHA256,
    finalRootInventorySha256: 'd'.repeat(64),
    baseImageObjects: [],
    baseImageObjectsSha256: 'e'.repeat(64),
  };
}

function inspectedExecutionImage() {
  const authority = verifiedExecutionImage();
  return {
    schema: 'missionpulse.local-execution-image-inspection' as const,
    version: 1 as const,
    platform: authority.platform,
    indexSha256: authority.indexSha256,
    manifestSha256: authority.manifestSha256,
    configSha256: authority.configSha256,
    layerSha256: authority.layerSha256,
    diffIdSha256: authority.diffIdSha256,
  };
}

function invocationPolicySha256(
  frozenDistHostPath: string,
  controllerBundleHostPath: string,
  evidenceHostPath: string
): string {
  return deriveIsolatedDockerInvocationPolicySha256({
    manifestSha256: MANIFEST_SHA256,
    frozenDistHostPath,
    controllerBundleHostPath,
    evidenceHostPath,
  });
}

describe('content-authorized release runtime contract', () => {
  it('pins the approved linux, Node and standalone Python authorities exactly', () => {
    expect(RELEASE_RUNTIME_CONTRACT).toMatchObject({
      platform: 'linux/amd64',
      node: {
        version: '22.23.1',
        manifestSha256: '8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27',
      },
      python: {
        version: '3.14.5',
        release: '20260510',
        archiveName:
          'cpython-3.14.5+20260510-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz',
        archiveBytes: 35_955_046,
        archiveSha256: 'dc10977b0db3bef1ee2275107fde6fe9c148135b556fa352e83c6baa67d17ed6',
        runtimeEntryCount: 4_758,
        runtimeFileCount: 3_510,
        runtimeDirectoryCount: 201,
        runtimeSymlinkCount: 1_047,
        runtimeBytes: 100_940_658,
        runtimeTreeSha256: '82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8',
        executableSha256: 'a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da',
        executablePath: '/opt/missionpulse-python/python/bin/python3.14',
      },
    });
  });

  it('builds the only allowed immutable-image invocation after no-follow preparation', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-args-')));
    const frozenDistHostPath = join(temporary, 'frozen-dist');
    const controllerBundleHostPath = join(temporary, 'release-controller.bundle.mjs');
    const evidenceHostPath = join(temporary, 'evidence');
    await mkdir(frozenDistHostPath);
    await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
    await mkdir(evidenceHostPath);
    await writeFile(controllerBundleHostPath, 'export {};\n');
    const inspectionRequests: unknown[] = [];
    const dockerCalls: Array<readonly string[]> = [];
    const prepared = await prepareIsolatedDockerRun({
      executionImageAuthority: verifiedExecutionImage(),
      inspectExecutionImage: async (request) => {
        inspectionRequests.push(request);
        return inspectedExecutionImage();
      },
      runDocker: (args) => {
        dockerCalls.push(args);
        return startedDockerRun();
      },
      frozenDistHostPath,
      controllerBundleHostPath,
      evidenceHostPath,
      invocationPolicySha256: invocationPolicySha256(
        frozenDistHostPath,
        controllerBundleHostPath,
        evidenceHostPath
      ),
      controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
      candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
      evidenceInventory: [],
    });

    expect('args' in prepared).toBe(false);
    expect('revalidate' in prepared).toBe(false);
    await expect(prepared.execute()).resolves.toBeUndefined();
    expect(dockerCalls).toHaveLength(1);
    expect(dockerCalls[0]).toContain('--pull=never');
    expect(dockerCalls[0]).toContain('--network=none');
    expect(dockerCalls[0].at(-1)).toBe(EXECUTION_REFERENCE);
    expect(prepared.effectiveInvocationPolicySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(inspectionRequests).toEqual([
      {
        reference: EXECUTION_REFERENCE,
        platform: 'linux/amd64',
      },
    ]);
    await expect(prepared.execute()).rejects.toThrow(ReleaseRuntimeContractError);
    expect(dockerCalls).toHaveLength(1);
    expect(inspectionRequests).toHaveLength(1);
    await expect(prepared.close()).resolves.toBeUndefined();
    await rm(temporary, { recursive: true, force: true });
  });

  it('never exposes the admitted ambient pathnames to Docker after opening the inputs', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-fd-mounts-')));
    const frozenDistHostPath = join(temporary, 'frozen-dist');
    const controllerBundleHostPath = join(temporary, 'release-controller.bundle.mjs');
    const evidenceHostPath = join(temporary, 'evidence');
    await mkdir(frozenDistHostPath);
    await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
    await mkdir(evidenceHostPath);
    await writeFile(controllerBundleHostPath, 'export {};\n');
    let dockerArgs: readonly string[] = [];
    const prepared = await prepareIsolatedDockerRun({
      executionImageAuthority: verifiedExecutionImage(),
      inspectExecutionImage: async () => inspectedExecutionImage(),
      runDocker: (args) => {
        dockerArgs = args;
        return startedDockerRun();
      },
      frozenDistHostPath,
      controllerBundleHostPath,
      evidenceHostPath,
      invocationPolicySha256: invocationPolicySha256(
        frozenDistHostPath,
        controllerBundleHostPath,
        evidenceHostPath
      ),
      controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
      candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
      evidenceInventory: [],
    });
    try {
      await prepared.execute();
      expect(dockerArgs.join('\n')).not.toContain(temporary);
      expect(dockerArgs.filter((arg) => arg.startsWith('type=bind,src='))).toEqual([
        expect.stringMatching(/^type=bind,src=\/proc\/\d+\/fd\/\d+,dst=\/inputs\/dist,readonly$/),
        expect.stringMatching(
          /^type=bind,src=\/proc\/\d+\/fd\/\d+,dst=\/inputs\/release-controller\.bundle\.mjs,readonly$/
        ),
        expect.stringMatching(
          /^type=bind,src=\/proc\/\d+\/fd\/\d+,dst=\/inputs\/evidence,readonly$/
        ),
      ]);
    } finally {
      await prepared.close();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects a completion promise when no process was synchronously spawned', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-deferred-run-')));
    const frozenDistHostPath = join(temporary, 'frozen-dist');
    const controllerBundleHostPath = join(temporary, 'release-controller.bundle.mjs');
    const evidenceHostPath = join(temporary, 'evidence');
    await mkdir(frozenDistHostPath);
    await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
    await mkdir(evidenceHostPath);
    await writeFile(controllerBundleHostPath, 'export {};\n');
    const prepared = await prepareIsolatedDockerRun({
      executionImageAuthority: verifiedExecutionImage(),
      inspectExecutionImage: async () => inspectedExecutionImage(),
      runDocker: () =>
        Object.freeze({
          completion: Promise.resolve().then(() => undefined),
        }),
      frozenDistHostPath,
      controllerBundleHostPath,
      evidenceHostPath,
      invocationPolicySha256: invocationPolicySha256(
        frozenDistHostPath,
        controllerBundleHostPath,
        evidenceHostPath
      ),
      controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
      candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
      evidenceInventory: [],
    });
    try {
      await expect(prepared.execute()).rejects.toThrow(ReleaseRuntimeContractError);
    } finally {
      await prepared.close();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it.each([
    ['a mutable tag', { imageReference: 'missionpulse-release-runtime:sealed-candidate' }],
    ['a raw config digest', { imageId: `sha256:${CONFIG_SHA256}` }],
  ])('rejects caller-provided %s before constructing an invocation', async (_label, extra) => {
    await expect(
      prepareIsolatedDockerRun({
        executionImageAuthority: verifiedExecutionImage(),
        inspectExecutionImage: async () => inspectedExecutionImage(),
        runDocker: () => startedDockerRun(),
        frozenDistHostPath: '/host/frozen-dist',
        controllerBundleHostPath: '/host/release-controller.bundle.mjs',
        evidenceHostPath: '/host/evidence',
        invocationPolicySha256: invocationPolicySha256(
          '/host/frozen-dist',
          '/host/release-controller.bundle.mjs',
          '/host/evidence'
        ),
        controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
        candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
        evidenceInventory: [],
        ...extra,
      } as never)
    ).rejects.toThrow(ReleaseRuntimeContractError);
  });

  it.each([
    ['imageReference', 'missionpulse-release-runtime:sealed-candidate'],
    ['configRef', `sha256:${CONFIG_SHA256}`],
  ])('rejects a caller-provided nested %s in image authority', async (key, value) => {
    await expect(
      prepareIsolatedDockerRun({
        executionImageAuthority: {
          ...verifiedExecutionImage(),
          [key]: value,
        } as never,
        inspectExecutionImage: async () => inspectedExecutionImage(),
        runDocker: () => startedDockerRun(),
        frozenDistHostPath: '/host/frozen-dist',
        controllerBundleHostPath: '/host/release-controller.bundle.mjs',
        evidenceHostPath: '/host/evidence',
        invocationPolicySha256: invocationPolicySha256(
          '/host/frozen-dist',
          '/host/release-controller.bundle.mjs',
          '/host/evidence'
        ),
        controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
        candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
        evidenceInventory: [],
      })
    ).rejects.toThrow(ReleaseRuntimeContractError);
  });

  it('cannot execute after close without inspecting or starting Docker', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-close-')));
    const frozenDistHostPath = join(temporary, 'dist');
    const evidenceHostPath = join(temporary, 'evidence');
    const controllerBundleHostPath = join(temporary, 'controller.mjs');
    await mkdir(frozenDistHostPath);
    await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
    await mkdir(evidenceHostPath);
    await writeFile(controllerBundleHostPath, 'export {};\n');
    let inspectionStarted = false;
    let dockerStarted = false;
    const prepared = await prepareIsolatedDockerRun({
      executionImageAuthority: verifiedExecutionImage(),
      inspectExecutionImage: async () => {
        inspectionStarted = true;
        return inspectedExecutionImage();
      },
      runDocker: () => {
        dockerStarted = true;
        return startedDockerRun();
      },
      frozenDistHostPath,
      controllerBundleHostPath,
      evidenceHostPath,
      invocationPolicySha256: invocationPolicySha256(
        frozenDistHostPath,
        controllerBundleHostPath,
        evidenceHostPath
      ),
      controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
      candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
      evidenceInventory: [],
    });
    try {
      await prepared.close();
      await expect(prepared.execute()).rejects.toThrow(ReleaseRuntimeContractError);
      expect(inspectionStarted).toBe(false);
      expect(dockerStarted).toBe(false);
    } finally {
      await prepared.close();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('cannot start Docker when close races an in-flight image inspection', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-close-race-')));
    const frozenDistHostPath = join(temporary, 'dist');
    const evidenceHostPath = join(temporary, 'evidence');
    const controllerBundleHostPath = join(temporary, 'controller.mjs');
    await mkdir(frozenDistHostPath);
    await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
    await mkdir(evidenceHostPath);
    await writeFile(controllerBundleHostPath, 'export {};\n');
    let releaseInspection: (() => void) | undefined;
    let announceInspection: (() => void) | undefined;
    const inspectionGate = new Promise<void>((resolve) => {
      releaseInspection = resolve;
    });
    const inspectionStarted = new Promise<void>((resolve) => {
      announceInspection = resolve;
    });
    let dockerStarted = false;
    const prepared = await prepareIsolatedDockerRun({
      executionImageAuthority: verifiedExecutionImage(),
      inspectExecutionImage: async () => {
        announceInspection?.();
        await inspectionGate;
        return inspectedExecutionImage();
      },
      runDocker: () => {
        dockerStarted = true;
        return startedDockerRun();
      },
      frozenDistHostPath,
      controllerBundleHostPath,
      evidenceHostPath,
      invocationPolicySha256: invocationPolicySha256(
        frozenDistHostPath,
        controllerBundleHostPath,
        evidenceHostPath
      ),
      controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
      candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
      evidenceInventory: [],
    });
    try {
      const execution = prepared.execute();
      await inspectionStarted;
      const closing = prepared.close();
      releaseInspection?.();
      await expect(execution).rejects.toThrow(ReleaseRuntimeContractError);
      await expect(closing).resolves.toBeUndefined();
      expect(dockerStarted).toBe(false);
    } finally {
      await prepared.close();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('revalidates mount identities after a delayed image inspection before Docker starts', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-inspect-race-')));
    const frozenDistHostPath = join(temporary, 'dist');
    const evidenceHostPath = join(temporary, 'evidence');
    const controllerBundleHostPath = join(temporary, 'controller.mjs');
    await mkdir(frozenDistHostPath);
    await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
    await mkdir(evidenceHostPath);
    await writeFile(controllerBundleHostPath, 'export {};\n');
    let releaseInspection: (() => void) | undefined;
    let announceInspection: (() => void) | undefined;
    const inspectionGate = new Promise<void>((resolve) => {
      releaseInspection = resolve;
    });
    const inspectionStarted = new Promise<void>((resolve) => {
      announceInspection = resolve;
    });
    let dockerStarted = false;
    const prepared = await prepareIsolatedDockerRun({
      executionImageAuthority: verifiedExecutionImage(),
      inspectExecutionImage: async () => {
        announceInspection?.();
        await inspectionGate;
        return inspectedExecutionImage();
      },
      runDocker: () => {
        dockerStarted = true;
        return startedDockerRun();
      },
      frozenDistHostPath,
      controllerBundleHostPath,
      evidenceHostPath,
      invocationPolicySha256: invocationPolicySha256(
        frozenDistHostPath,
        controllerBundleHostPath,
        evidenceHostPath
      ),
      controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
      candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
      evidenceInventory: [],
    });
    try {
      const execution = prepared.execute();
      await inspectionStarted;
      await writeFile(controllerBundleHostPath, 'export{ };\n');
      releaseInspection?.();
      await expect(execution).rejects.toThrow(ReleaseRuntimeContractError);
      expect(dockerStarted).toBe(false);
    } finally {
      await prepared.close();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it.each(['/relative', '/host/with,comma', '/host/with\nnewline', '/var/run/docker.sock'])(
    'rejects a forbidden mount source %s',
    async (frozenDistHostPath) => {
      const path = frozenDistHostPath === '/relative' ? 'relative' : frozenDistHostPath;
      await expect(
        prepareIsolatedDockerRun({
          executionImageAuthority: verifiedExecutionImage(),
          inspectExecutionImage: async () => inspectedExecutionImage(),
          runDocker: () => startedDockerRun(),
          frozenDistHostPath: path,
          controllerBundleHostPath: '/host/release-controller.bundle.mjs',
          evidenceHostPath: '/host/evidence',
          invocationPolicySha256: '0'.repeat(64),
          controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
          candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
          evidenceInventory: [],
        })
      ).rejects.toThrow(ReleaseRuntimeContractError);
    }
  );

  it.each(['/host/frozen-dist', '/host/frozen-dist/evidence', '/host'])(
    'rejects an evidence mount that aliases another read-only input at %s',
    async (evidenceHostPath) => {
      await expect(
        prepareIsolatedDockerRun({
          executionImageAuthority: verifiedExecutionImage(),
          inspectExecutionImage: async () => inspectedExecutionImage(),
          runDocker: () => startedDockerRun(),
          frozenDistHostPath: '/host/frozen-dist',
          controllerBundleHostPath: '/host/release-controller.bundle.mjs',
          evidenceHostPath,
          invocationPolicySha256: '0'.repeat(64),
          controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
          candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
          evidenceInventory: [],
        })
      ).rejects.toThrow(ReleaseRuntimeContractError);
    }
  );

  it.each([
    ['index', 'indexSha256', 'd'.repeat(64)],
    ['manifest', 'manifestSha256', 'e'.repeat(64)],
    ['config', 'configSha256', 'f'.repeat(64)],
    ['platform', 'platform', 'linux/arm64'],
    ['layer graph', 'layerSha256', ['1'.repeat(64)]],
    ['diff-ID graph', 'diffIdSha256', ['2'.repeat(64)]],
  ] as const)(
    'rejects a re-inspected %s that differs from the captured OCI authority',
    async (_label, key, value) => {
      const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-inspect-')));
      const frozenDistHostPath = join(temporary, 'dist');
      const evidenceHostPath = join(temporary, 'evidence');
      const controllerBundleHostPath = join(temporary, 'controller.mjs');
      await mkdir(frozenDistHostPath);
      await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
      await mkdir(evidenceHostPath);
      await writeFile(controllerBundleHostPath, 'export {};\n');
      let dockerStarted = false;

      const prepared = await prepareIsolatedDockerRun({
        executionImageAuthority: verifiedExecutionImage(),
        inspectExecutionImage: async () => ({
          ...inspectedExecutionImage(),
          [key]: value,
        }),
        runDocker: () => {
          dockerStarted = true;
          return startedDockerRun();
        },
        frozenDistHostPath,
        controllerBundleHostPath,
        evidenceHostPath,
        invocationPolicySha256: invocationPolicySha256(
          frozenDistHostPath,
          controllerBundleHostPath,
          evidenceHostPath
        ),
        controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
        candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
        evidenceInventory: [],
      });
      try {
        await expect(prepared.execute()).rejects.toThrow(ReleaseRuntimeContractError);
        expect(dockerStarted).toBe(false);
      } finally {
        await prepared.close();
        await rm(temporary, { recursive: true, force: true });
      }
    }
  );

  it('opens canonical host mount sources without following links and revalidates them', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-mounts-')));
    const frozenDistHostPath = join(temporary, 'dist');
    const evidenceHostPath = join(temporary, 'evidence');
    const controllerBundleHostPath = join(temporary, 'controller.mjs');
    await mkdir(frozenDistHostPath);
    await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
    await mkdir(evidenceHostPath);
    await writeFile(controllerBundleHostPath, 'export {};\n');
    let dockerStarted = false;

    const prepared = await prepareIsolatedDockerRun({
      executionImageAuthority: verifiedExecutionImage(),
      inspectExecutionImage: async () => inspectedExecutionImage(),
      runDocker: () => {
        dockerStarted = true;
        return startedDockerRun();
      },
      frozenDistHostPath,
      controllerBundleHostPath,
      evidenceHostPath,
      invocationPolicySha256: invocationPolicySha256(
        frozenDistHostPath,
        controllerBundleHostPath,
        evidenceHostPath
      ),
      controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
      candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
      evidenceInventory: [],
    });
    try {
      await writeFile(controllerBundleHostPath, 'export{ };\n');
      await expect(prepared.execute()).rejects.toThrow(ReleaseRuntimeContractError);
      expect(dockerStarted).toBe(false);
    } finally {
      await prepared.close();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects a host mount whose final component is a symlink', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-mount-link-')));
    const frozenDistHostPath = join(temporary, 'dist');
    const evidenceHostPath = join(temporary, 'evidence');
    const controllerTarget = join(temporary, 'controller-target.mjs');
    const controllerBundleHostPath = join(temporary, 'controller.mjs');
    await mkdir(frozenDistHostPath);
    await writeFile(join(frozenDistHostPath, 'manifest.json'), CANDIDATE_MANIFEST);
    await mkdir(evidenceHostPath);
    await writeFile(controllerTarget, 'export {};\n');
    await symlink(controllerTarget, controllerBundleHostPath);

    try {
      await expect(
        prepareIsolatedDockerRun({
          executionImageAuthority: verifiedExecutionImage(),
          inspectExecutionImage: async () => inspectedExecutionImage(),
          runDocker: () => startedDockerRun(),
          frozenDistHostPath,
          controllerBundleHostPath,
          evidenceHostPath,
          invocationPolicySha256: invocationPolicySha256(
            frozenDistHostPath,
            controllerBundleHostPath,
            evidenceHostPath
          ),
          controllerBundleSha256: CONTROLLER_BUNDLE_SHA256,
          candidateArtifactTree: CANDIDATE_ARTIFACT_TREE,
          evidenceInventory: [],
        })
      ).rejects.toThrow(ReleaseRuntimeContractError);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('invokes only the content-authorized interpreter with isolated flags and a fixed environment', () => {
    const invocation = createIsolatedPythonInvocation('print("probe", end="")');

    expect(invocation).toEqual({
      executable: '/opt/missionpulse-python/python/bin/python3.14',
      args: ['-I', '-E', '-S', '-B', '-c', 'print("probe", end="")'],
      env: {
        HOME: '/nonexistent',
        LANG: 'C',
        LC_ALL: 'C',
        TZ: 'UTC',
      },
    });
    expect(Object.keys(invocation.env)).not.toContain('PATH');
    expect(Object.keys(invocation.env).some((key) => key.startsWith('PYTHON'))).toBe(false);
    expect(Object.keys(invocation.env).some((key) => key.startsWith('LD_'))).toBe(false);
    expect(Object.keys(invocation.env).some((key) => key.startsWith('DYLD_'))).toBe(false);
  });

  it('rejects an empty, oversized or NUL-bearing Python helper before execution', () => {
    expect(() => createIsolatedPythonInvocation('')).toThrow(ReleaseRuntimeContractError);
    expect(() => createIsolatedPythonInvocation('x\0y')).toThrow(ReleaseRuntimeContractError);
    expect(() => createIsolatedPythonInvocation('x'.repeat(262_145))).toThrow(
      ReleaseRuntimeContractError
    );
  });
});
