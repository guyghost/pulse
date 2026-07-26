import { describe, expect, it } from 'vitest';

import * as hostAdapterModule from '../../../scripts/release-runtime/oci-host-adapter';
import {
  DockerHostAdapterError,
  authorizeReleaseRuntimeHostAdmission,
  executeVerifiedOciRuntime,
} from '../../../scripts/release-runtime/oci-host-adapter';

async function onHost<T>(
  platform: NodeJS.Platform,
  architecture: string,
  operation: () => Promise<T>
): Promise<T> {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  const architectureDescriptor = Object.getOwnPropertyDescriptor(process, 'arch');
  if (platformDescriptor === undefined || architectureDescriptor === undefined) {
    throw new Error('Node host descriptors are unavailable.');
  }
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: platform });
  Object.defineProperty(process, 'arch', { ...architectureDescriptor, value: architecture });
  try {
    return await operation();
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor);
    Object.defineProperty(process, 'arch', architectureDescriptor);
  }
}

describe.sequential('release runtime host-admission capability boundary', () => {
  it.each([
    ['darwin', 'x64'],
    ['linux', 'arm64'],
  ] as const)('rejects %s/%s before inspecting the candidate token', async (platform, arch) => {
    let inspected = false;
    const hostile = new Proxy(Object.create(null) as object, {
      get() {
        inspected = true;
        throw new Error('candidate getter reached');
      },
      ownKeys() {
        inspected = true;
        throw new Error('candidate keys reached');
      },
    });

    await expect(
      onHost(platform, arch, () => authorizeReleaseRuntimeHostAdmission(hostile as never))
    ).rejects.toThrow(/linux\/x64/i);
    await expect(
      onHost(platform, arch, () => executeVerifiedOciRuntime(hostile as never))
    ).rejects.toThrow(/linux\/x64/i);
    expect(inspected).toBe(false);
  });

  it.each([
    ['raw DTO', Object.freeze({ ociArchivePath: '/tmp/forged' })],
    ['structural cast', Object.freeze({})],
    ['forged brand', Object.freeze({ [Symbol('release-runtime-host-admission')]: true })],
  ])('rejects a %s on a supported host without reading candidate fields', async (_label, value) => {
    await expect(
      onHost('linux', 'x64', () => authorizeReleaseRuntimeHostAdmission(value as never))
    ).rejects.toThrow(/capability|admission/i);
    await expect(
      onHost('linux', 'x64', () => executeVerifiedOciRuntime(value as never))
    ).rejects.toThrow(/capability|admission/i);
  });

  it('rejects proxy/getter tokens without invoking attacker-controlled traps', async () => {
    let trapped = false;
    const hostile = new Proxy(Object.create(null) as object, {
      get() {
        trapped = true;
        throw new Error('forged getter reached');
      },
      getPrototypeOf() {
        trapped = true;
        throw new Error('forged prototype reached');
      },
      ownKeys() {
        trapped = true;
        throw new Error('forged keys reached');
      },
    });

    await expect(
      onHost('linux', 'x64', () => authorizeReleaseRuntimeHostAdmission(hostile as never))
    ).rejects.toThrow(DockerHostAdapterError);
    await expect(
      onHost('linux', 'x64', () => executeVerifiedOciRuntime(hostile as never))
    ).rejects.toThrow(DockerHostAdapterError);
    expect(trapped).toBe(false);
  });

  it('does not accept an environment variable or a second adapter argument as authority', async () => {
    const previous = process.env.MISSIONPULSE_RELEASE_RUNTIME_CAPABILITY;
    process.env.MISSIONPULSE_RELEASE_RUNTIME_CAPABILITY = 'admitted';
    let adapterUsed = false;
    try {
      await expect(
        onHost('linux', 'x64', () =>
          (
            executeVerifiedOciRuntime as unknown as (
              token: object,
              adapter: { start: () => never }
            ) => Promise<unknown>
          )(Object.freeze({}), {
            start() {
              adapterUsed = true;
              throw new Error('forged adapter reached');
            },
          })
        )
      ).rejects.toThrow(/capability|admission/i);
    } finally {
      if (previous === undefined) {
        delete process.env.MISSIONPULSE_RELEASE_RUNTIME_CAPABILITY;
      } else {
        process.env.MISSIONPULSE_RELEASE_RUNTIME_CAPABILITY = previous;
      }
    }
    expect(adapterUsed).toBe(false);
  });

  it('exports no token mint, registrar, constructor or test hook', () => {
    const exportedNames = Object.keys(hostAdapterModule);
    expect(exportedNames).toContain('authorizeReleaseRuntimeHostAdmission');
    expect(exportedNames).toContain('executeVerifiedOciRuntime');
    expect(
      exportedNames.filter((name) =>
        /(?:mint|register|issue|create).*capability|capability.*(?:mint|register|issue|create)|forTest|testHook/i.test(
          name
        )
      )
    ).toEqual([]);
    expect(authorizeReleaseRuntimeHostAdmission).toHaveLength(1);
    expect(executeVerifiedOciRuntime).toHaveLength(1);
  });
});
