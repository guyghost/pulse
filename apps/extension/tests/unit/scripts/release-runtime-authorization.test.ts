import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  ReleaseRuntimeAuthorizationError,
  type ReleaseRuntimeObservation,
  type VerifiedExecutionImageAuthorityV1,
  authorizeReleaseRuntimeObservation,
} from '../../../scripts/release-runtime/proof';
import { ReleaseRuntimeContractError } from '../../../scripts/release-runtime/contract';
import {
  type ReleaseControllerExecutionAuthorityV1,
  authorizeRuntimeForRelease,
} from '../../../scripts/release-runtime/controller';
import { jcsCanonicalize } from '../../../scripts/release-readiness/contracts';

const runtimeTreeSha256 = '82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8';
const executableSha256 = 'a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da';
const executionImageIndexSha256 = '8'.repeat(64);
const executionImageManifestSha256 = '9'.repeat(64);
const executionImageConfigSha256 = 'a'.repeat(64);
const executionImageLayerSha256 = ['6'.repeat(64), '7'.repeat(64)];
const executionImageDiffIdSha256 = ['4'.repeat(64), '5'.repeat(64)];
const finalRootInventorySha256 = 'b'.repeat(64);
const manifestSha256 = createHash('sha256').update('{}').digest('hex');
const candidateArtifactTree = {
  algorithm: 'missionpulse-tree-sha256-v2' as const,
  fileCount: 1,
  treeSha256: createHash('sha256')
    .update(`${['manifest.json', '2', manifestSha256].join('\0')}\n`)
    .digest('hex'),
  manifestSha256,
  entries: [{ path: 'manifest.json', bytes: 2, sha256: manifestSha256, mode: '0644' as const }],
};
const payloadEvidenceInventory = [
  { path: 'build-metadata.json', bytes: 1, sha256: '1'.repeat(64) },
  { path: 'build-provenance.json', bytes: 1, sha256: '2'.repeat(64) },
  { path: 'release-execution-authority.json', bytes: 1, sha256: '3'.repeat(64) },
  { path: 'tested-dist-seal.json', bytes: 1, sha256: '4'.repeat(64) },
  { path: 'transport-zip-receipt.json', bytes: 1, sha256: '5'.repeat(64) },
];

function sha256Jcs(value: unknown): string {
  return createHash('sha256').update(jcsCanonicalize(value)).digest('hex');
}

function verificationId(): string {
  return `payload:${sha256Jcs([
    'missionpulse.release-payload-verification-id',
    1,
    'release-1',
    '4'.repeat(64),
    '7'.repeat(64),
    '8'.repeat(64),
    '3'.repeat(64),
  ])}`;
}

const loadedObjectEntries = [
  {
    path: '/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
    source: 'base-image' as const,
    bytes: 210_968,
    sha256: '1'.repeat(64),
  },
  {
    path: '/opt/missionpulse-python/python/lib/python3.14/lib-dynload/_hashlib.so',
    source: 'python-runtime' as const,
    bytes: 82_432,
    sha256: '2'.repeat(64),
  },
];

function loadedObjectsSha256(entries: typeof loadedObjectEntries): string {
  return createHash('sha256')
    .update(JSON.stringify(['missionpulse-effective-loaded-objects', 1, entries]))
    .digest('hex');
}

const baseImageObjects = loadedObjectEntries
  .filter((entry) => entry.source === 'base-image')
  .map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));

function baseImageObjectsSha256(entries: typeof baseImageObjects): string {
  return createHash('sha256')
    .update(JSON.stringify(['missionpulse-verified-base-image-objects', 1, entries]))
    .digest('hex');
}

function validExecutionImageAuthority(): VerifiedExecutionImageAuthorityV1 {
  return {
    schema: 'missionpulse.verified-execution-image-authority',
    version: 1,
    platform: 'linux/amd64',
    indexSha256: executionImageIndexSha256,
    manifestSha256: executionImageManifestSha256,
    configSha256: executionImageConfigSha256,
    layerSha256: executionImageLayerSha256,
    diffIdSha256: executionImageDiffIdSha256,
    finalRootInventorySha256,
    baseImageObjects,
    baseImageObjectsSha256: baseImageObjectsSha256(baseImageObjects),
  };
}

function validControllerAuthority(): ReleaseControllerExecutionAuthorityV1 {
  const unsigned = {
    schema: 'missionpulse.release-controller-execution-authority',
    version: 1,
    executionImage: validExecutionImageAuthority(),
    controllerBundleSha256: 'c'.repeat(64),
    controllerSourceInventorySha256: 'd'.repeat(64),
    candidateArtifactTree,
    evidenceInventory: payloadEvidenceInventory,
    payload: {
      verificationId: verificationId(),
      releaseId: 'release-1',
      sealId: 'seal-1',
      sealSha256: '4'.repeat(64),
      sourceCommit: '6'.repeat(64),
      transportSha256: '7'.repeat(64),
      transportZipReceiptSha256: '5'.repeat(64),
      payloadInventorySha256: '8'.repeat(64),
      ociArchiveSha256: '9'.repeat(64),
      verifiedAt: '2026-07-17T00:00:00.000Z',
    },
    invocationPolicySha256: '0'.repeat(64),
    effectiveLoadedObjectsSha256: loadedObjectsSha256(loadedObjectEntries),
  };
  return {
    ...unsigned,
    authoritySha256: sha256Jcs(unsigned),
  } as ReleaseControllerExecutionAuthorityV1;
}

function validPayloadObservation() {
  return {
    candidateArtifactTree,
    evidenceInventory: payloadEvidenceInventory,
    controllerBundleSha256: 'c'.repeat(64),
  };
}

function validObservation(): ReleaseRuntimeObservation {
  const inventory = {
    entryCount: 4_758,
    fileCount: 3_510,
    directoryCount: 201,
    symlinkCount: 1_047,
    regularFileBytes: 100_940_658,
    treeSha256: runtimeTreeSha256,
    executableSha256,
  };

  return {
    platform: 'linux',
    architecture: 'x64',
    uid: 65_532,
    gid: 65_532,
    noNewPrivileges: true,
    effectiveCapabilitiesHex: '0000000000000000',
    ambientEnvironment: {
      HOME: '/nonexistent',
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC',
    },
    mountInfo: [
      '20 1 0:20 / / ro,nosuid,nodev - overlay overlay ro',
      '21 20 0:21 / /inputs/dist ro,nosuid,nodev - bind /host/dist ro',
      '22 20 0:22 / /inputs/release-controller.bundle.mjs ro,nosuid,nodev - bind /host/controller ro',
      '23 20 0:23 / /inputs/evidence ro,nosuid,nodev - bind /host/evidence ro',
      '24 20 0:24 / /outputs rw,nosuid,nodev,noexec - tmpfs tmpfs rw,size=65536k,mode=700,uid=65532,gid=65532',
      '25 20 0:25 / /tmp rw,nosuid,nodev,noexec - tmpfs tmpfs rw,size=65536k,mode=700,uid=65532,gid=65532',
    ].join('\n'),
    beforeMutationInventory: inventory,
    mutationAttempts: {
      create: 'blocked',
      rename: 'blocked',
      unlink: 'blocked',
      chmod: 'blocked',
      sameSizeWrite: 'blocked',
    },
    afterMutationInventory: inventory,
    loadedObjects: {
      schema: 'missionpulse.effective-loaded-objects',
      version: 1,
      entries: loadedObjectEntries,
      objectsSha256: loadedObjectsSha256(loadedObjectEntries),
    },
  };
}

describe('release runtime authorization', () => {
  it('authorizes the exact non-root, read-only runtime observation', () => {
    const capability = authorizeReleaseRuntimeObservation(
      validObservation(),
      validExecutionImageAuthority()
    );

    expect(capability).toMatchObject({
      platform: 'linux/amd64',
      pythonRuntimeTreeSha256: runtimeTreeSha256,
      pythonExecutableSha256: executableSha256,
      effectiveLoadedObjectsSha256: loadedObjectsSha256(loadedObjectEntries),
      executionImageIndexSha256,
      executionImageManifestSha256,
      executionImageConfigSha256,
      executionImageLayerSha256,
      executionImageDiffIdSha256,
      finalRootInventorySha256,
      baseImageObjectsSha256: baseImageObjectsSha256(baseImageObjects),
    });
    expect(Object.isFrozen(capability)).toBe(true);
  });

  it('accepts the single terminal LF emitted by /proc/self/mountinfo', () => {
    const observation = validObservation();
    expect(
      authorizeReleaseRuntimeObservation(
        {
          ...observation,
          mountInfo: `${observation.mountInfo}\n`,
        },
        validExecutionImageAuthority()
      )
    ).toMatchObject({ platform: 'linux/amd64' });
  });

  it('publishes exact typed runtime evidence only after authority and runtime authorization', async () => {
    const published: unknown[] = [];
    const result = await authorizeRuntimeForRelease({
      readExecutionAuthority: async () => validControllerAuthority(),
      observeRuntime: async () => validObservation(),
      observePayload: async () => validPayloadObservation(),
      publishRuntimeEvidence: async (evidence) => {
        published.push(evidence);
      },
    });

    expect(result).toMatchObject({
      schema: 'missionpulse.release-execution-payload-verification',
      version: 1,
      verificationId: verificationId(),
      releaseId: 'release-1',
      sealId: 'seal-1',
      sealSha256: '4'.repeat(64),
      sourceCommit: '6'.repeat(64),
      transportSha256: '7'.repeat(64),
      transportZipReceiptSha256: '5'.repeat(64),
      payloadInventorySha256: '8'.repeat(64),
      controllerBundleSha256: 'c'.repeat(64),
      controllerBundleSourceInventorySha256: 'd'.repeat(64),
      buildMetadataSha256: '1'.repeat(64),
      buildProvenanceSha256: '2'.repeat(64),
      executionAuthoritySha256: '3'.repeat(64),
      controllerExecutionAuthoritySha256: validControllerAuthority().authoritySha256,
      ociArchiveSha256: '9'.repeat(64),
      ociIndexSha256: executionImageIndexSha256,
      ociManifestSha256: executionImageManifestSha256,
      ociConfigSha256: executionImageConfigSha256,
      layerSha256: executionImageLayerSha256,
      diffIdSha256: executionImageDiffIdSha256,
      finalRootInventorySha256,
      pythonRuntimeTreeSha256: runtimeTreeSha256,
      pythonExecutableSha256: executableSha256,
      effectiveLoadedObjectsSha256: loadedObjectsSha256(loadedObjectEntries),
      verifiedAt: '2026-07-17T00:00:00.000Z',
    });
    expect(result.verificationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(published).toEqual([result]);
  });

  it('rejects a forged controller authority self-digest before runtime observation', async () => {
    let observed = false;
    await expect(
      authorizeRuntimeForRelease({
        readExecutionAuthority: async () => ({
          ...validControllerAuthority(),
          authoritySha256: 'f'.repeat(64),
        }),
        observeRuntime: async () => {
          observed = true;
          return validObservation();
        },
        observePayload: async () => validPayloadObservation(),
        publishRuntimeEvidence: async () => undefined,
      })
    ).rejects.toBeInstanceOf(ReleaseRuntimeContractError);
    expect(observed).toBe(false);
  });

  it('rejects an alternate verification ID even when the authority self-digest is recomputed', async () => {
    const exact = validControllerAuthority();
    const { authoritySha256: _authoritySha256, ...unsigned } = exact;
    const forgedUnsigned = {
      ...unsigned,
      payload: { ...unsigned.payload, verificationId: 'payload:forged' },
    };
    await expect(
      authorizeRuntimeForRelease({
        readExecutionAuthority: async () => ({
          ...forgedUnsigned,
          authoritySha256: sha256Jcs(forgedUnsigned),
        }),
        observeRuntime: async () => validObservation(),
        observePayload: async () => validPayloadObservation(),
        publishRuntimeEvidence: async () => undefined,
      })
    ).rejects.toBeInstanceOf(ReleaseRuntimeContractError);
  });

  it('rejects an effective-loaded-object authority mismatch before publication', async () => {
    let published = false;
    await expect(
      authorizeRuntimeForRelease({
        readExecutionAuthority: async () => ({
          ...validControllerAuthority(),
          effectiveLoadedObjectsSha256: 'f'.repeat(64),
        }),
        observeRuntime: async () => validObservation(),
        observePayload: async () => validPayloadObservation(),
        publishRuntimeEvidence: async () => {
          published = true;
        },
      })
    ).rejects.toBeInstanceOf(ReleaseRuntimeContractError);
    expect(published).toBe(false);
  });

  it.each([
    ['index', { indexSha256: 'z'.repeat(64) }],
    ['manifest', { manifestSha256: 'z'.repeat(64) }],
    ['config', { configSha256: 'z'.repeat(64) }],
    ['layer graph', { layerSha256: ['z'.repeat(64)] }],
    ['diff-ID graph', { diffIdSha256: [] }],
  ])('rejects malformed %s execution-image authority', (_label, mutation) => {
    expect(() =>
      authorizeReleaseRuntimeObservation(validObservation(), {
        ...validExecutionImageAuthority(),
        ...mutation,
      })
    ).toThrow(ReleaseRuntimeAuthorizationError);
  });

  it('rejects a loaded base-image object absent from the verified image authority', () => {
    const authority = validExecutionImageAuthority();
    expect(() =>
      authorizeReleaseRuntimeObservation(validObservation(), {
        ...authority,
        baseImageObjects: [],
        baseImageObjectsSha256: baseImageObjectsSha256([]),
      })
    ).toThrow(ReleaseRuntimeAuthorizationError);
  });

  it('rejects loaded base-image bytes that differ from the verified image authority', () => {
    const authority = validExecutionImageAuthority();
    const changed = authority.baseImageObjects.map((entry) => ({
      ...entry,
      sha256: '9'.repeat(64),
    }));
    expect(() =>
      authorizeReleaseRuntimeObservation(validObservation(), {
        ...authority,
        baseImageObjects: changed,
        baseImageObjectsSha256: baseImageObjectsSha256(changed),
      })
    ).toThrow(ReleaseRuntimeAuthorizationError);
  });

  const hostileCases: ReadonlyArray<
    readonly [string, (observation: ReleaseRuntimeObservation) => ReleaseRuntimeObservation]
  > = [
    ['unsupported platform', (value) => ({ ...value, platform: 'darwin' })],
    ['unsupported architecture', (value) => ({ ...value, architecture: 'arm64' })],
    ['root user', (value) => ({ ...value, uid: 0 })],
    [
      'writable root overlay',
      (value) => ({
        ...value,
        mountInfo: value.mountInfo.replace(' / ro,nosuid,nodev ', ' / rw,nosuid,nodev '),
      }),
    ],
    [
      'writable candidate mount',
      (value) => ({
        ...value,
        mountInfo: value.mountInfo.replace(
          '/inputs/dist ro,nosuid,nodev',
          '/inputs/dist rw,nosuid,nodev'
        ),
      }),
    ],
    [
      'writable Python submount',
      (value) => ({
        ...value,
        mountInfo: `${value.mountInfo}\n26 20 0:26 / /opt/missionpulse-python/python/lib rw,nosuid,nodev - bind /host/injected-lib rw`,
      }),
    ],
    [
      'non-tmpfs temporary mount',
      (value) => ({
        ...value,
        mountInfo: value.mountInfo.replace(
          '/ /tmp rw,nosuid,nodev,noexec - tmpfs tmpfs rw,size=65536k,mode=700,uid=65532,gid=65532',
          '/ /tmp rw,nosuid,nodev,noexec - bind /host/tmp rw,size=65536k,mode=700,uid=65532,gid=65532'
        ),
      }),
    ],
    [
      'unbounded temporary mount',
      (value) => ({
        ...value,
        mountInfo: value.mountInfo.replace(
          '/ /tmp rw,nosuid,nodev,noexec - tmpfs tmpfs rw,size=65536k,mode=700,uid=65532,gid=65532',
          '/ /tmp rw,nosuid,nodev,noexec - tmpfs tmpfs rw,size=131072k,mode=700,uid=65532,gid=65532'
        ),
      }),
    ],
    [
      'runtime tree drift',
      (value) => ({
        ...value,
        beforeMutationInventory: {
          ...value.beforeMutationInventory,
          treeSha256: '3'.repeat(64),
        },
      }),
    ],
    [
      'executable drift',
      (value) => ({
        ...value,
        beforeMutationInventory: {
          ...value.beforeMutationInventory,
          executableSha256: '4'.repeat(64),
        },
      }),
    ],
    [
      'successful runtime mutation',
      (value) => ({
        ...value,
        mutationAttempts: { ...value.mutationAttempts, chmod: 'succeeded' },
      }),
    ],
    [
      'loaded-object drift',
      (value) => ({
        ...value,
        loadedObjects: { ...value.loadedObjects, objectsSha256: '5'.repeat(64) },
      }),
    ],
    [
      'ambient Python injection',
      (value) => ({
        ...value,
        ambientEnvironment: { ...value.ambientEnvironment, PYTHONPATH: '/host/attack' },
      }),
    ],
    [
      'extra controller environment',
      (value) => ({
        ...value,
        ambientEnvironment: { ...value.ambientEnvironment, NODE_VERSION: '22.23.1' },
      }),
    ],
  ];

  it.each(hostileCases)('blocks %s before candidate access', async (_label, mutate) => {
    let evidencePublished = false;
    const observation = mutate(validObservation());

    await expect(
      authorizeRuntimeForRelease({
        readExecutionAuthority: async () => validControllerAuthority(),
        observeRuntime: async () => observation,
        observePayload: async () => validPayloadObservation(),
        publishRuntimeEvidence: async () => {
          evidencePublished = true;
        },
      })
    ).rejects.toBeInstanceOf(ReleaseRuntimeAuthorizationError);
    expect(evidencePublished).toBe(false);
  });

  it.each([
    [
      'unsorted entries',
      (value: ReleaseRuntimeObservation) => ({
        ...value,
        loadedObjects: {
          ...value.loadedObjects,
          entries: [...value.loadedObjects.entries].reverse(),
        },
      }),
    ],
    [
      'relative object path',
      (value: ReleaseRuntimeObservation) => ({
        ...value,
        loadedObjects: {
          ...value.loadedObjects,
          entries: [{ ...value.loadedObjects.entries[0], path: 'relative.so' }],
        },
      }),
    ],
  ])('rejects %s as an effective-loaded-object proof', (_label, mutate) => {
    expect(() =>
      authorizeReleaseRuntimeObservation(mutate(validObservation()), validExecutionImageAuthority())
    ).toThrow(ReleaseRuntimeAuthorizationError);
  });
});
