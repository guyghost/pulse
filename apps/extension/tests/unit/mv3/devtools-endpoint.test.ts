import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  parseDevToolsActivePort,
  readDevToolsEndpointFile,
  waitForDevToolsEndpoint,
} from '../../mv3/harness/devtools-endpoint';

const BROWSER_UUID = '8d2f0c65-4e3b-4b88-8dc4-0fdf90d3195e';
const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true }))
  );
});

describe('strict DevToolsActivePort capability', () => {
  it('accepts exactly one canonical loopback port and lowercase browser UUID', () => {
    const endpoint = parseDevToolsActivePort(`9222\n/devtools/browser/${BROWSER_UUID}\n`, {
      processGeneration: 3,
      profileRealPath: '/tmp/missionpulse-profile',
    });

    expect(endpoint).toEqual({
      browserPath: `/devtools/browser/${BROWSER_UUID}`,
      endpointSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      port: 9222,
      processGeneration: 3,
      profileRealPath: '/tmp/missionpulse-profile',
      webSocketUrl: `ws://127.0.0.1:9222/devtools/browser/${BROWSER_UUID}`,
    });
    expect(Object.isFrozen(endpoint)).toBe(true);
  });

  it("accepts Chromium's canonical two records without a final newline", () => {
    expect(
      parseDevToolsActivePort(`9222\n/devtools/browser/${BROWSER_UUID}`, {
        processGeneration: 3,
        profileRealPath: '/tmp/missionpulse-profile',
      })
    ).toMatchObject({ port: 9222, browserPath: `/devtools/browser/${BROWSER_UUID}` });
  });

  it.each([
    '',
    '9222\n',
    `9222\n/devtools/browser/${BROWSER_UUID}\nextra\n`,
    `09222\n/devtools/browser/${BROWSER_UUID}\n`,
    `0\n/devtools/browser/${BROWSER_UUID}\n`,
    `65536\n/devtools/browser/${BROWSER_UUID}\n`,
    `not-a-port\n/devtools/browser/${BROWSER_UUID}\n`,
    `9222 \n/devtools/browser/${BROWSER_UUID}\n`,
    `9222\r\n/devtools/browser/${BROWSER_UUID}\r\n`,
    `9222\n/devtools/browser/${BROWSER_UUID.toUpperCase()}\n`,
    `9222\n/devtools/browser/${BROWSER_UUID} \n`,
    `9222\n/devtools/page/${BROWSER_UUID}\n`,
    `9222\nws://127.0.0.1:9222/devtools/browser/${BROWSER_UUID}\n`,
    `9222\n/devtools/browser/${BROWSER_UUID}\u0000\n`,
  ])('rejects non-canonical endpoint bytes %#', (raw) => {
    expect(() =>
      parseDevToolsActivePort(raw, {
        processGeneration: 3,
        profileRealPath: '/tmp/missionpulse-profile',
      })
    ).toThrow();
  });

  it('binds the private endpoint hash to the process generation and profile', () => {
    const raw = `9222\n/devtools/browser/${BROWSER_UUID}\n`;
    const first = parseDevToolsActivePort(raw, {
      processGeneration: 1,
      profileRealPath: '/tmp/profile-a',
    });
    const nextGeneration = parseDevToolsActivePort(raw, {
      processGeneration: 2,
      profileRealPath: '/tmp/profile-a',
    });
    const nextProfile = parseDevToolsActivePort(raw, {
      processGeneration: 1,
      profileRealPath: '/tmp/profile-b',
    });

    expect(first.endpointSha256).not.toBe(nextGeneration.endpointSha256);
    expect(first.endpointSha256).not.toBe(nextProfile.endpointSha256);
  });

  it('reads a no-follow regular endpoint file from the exact real profile', async () => {
    const profile = await mkdtemp(join(tmpdir(), 'missionpulse-endpoint-'));
    cleanupPaths.push(profile);
    const profileRealPath = await realpath(profile);
    const endpointPath = join(profile, 'DevToolsActivePort');
    await writeFile(endpointPath, `9222\n/devtools/browser/${BROWSER_UUID}\n`, 'utf8');

    await expect(
      readDevToolsEndpointFile(endpointPath, { processGeneration: 7, profileRealPath })
    ).resolves.toMatchObject({
      port: 9222,
      processGeneration: 7,
      profileRealPath,
    });
  });

  it('rejects a symlinked endpoint path', async () => {
    const profile = await mkdtemp(join(tmpdir(), 'missionpulse-endpoint-'));
    cleanupPaths.push(profile);
    const target = join(profile, 'actual-port');
    const endpointPath = join(profile, 'DevToolsActivePort');
    await writeFile(target, `9222\n/devtools/browser/${BROWSER_UUID}\n`, 'utf8');
    await symlink(target, endpointPath);

    await expect(
      readDevToolsEndpointFile(endpointPath, {
        processGeneration: 1,
        profileRealPath: await realpath(profile),
      })
    ).rejects.toThrow(/regular no-follow file/i);
  });

  it('rejects non-regular and oversized endpoint files', async () => {
    const profile = await mkdtemp(join(tmpdir(), 'missionpulse-endpoint-'));
    cleanupPaths.push(profile);
    const profileRealPath = await realpath(profile);
    const endpointPath = join(profile, 'DevToolsActivePort');
    await mkdir(endpointPath);

    await expect(
      readDevToolsEndpointFile(endpointPath, { processGeneration: 1, profileRealPath })
    ).rejects.toThrow(/regular no-follow file/i);
    await rm(endpointPath, { recursive: true });
    await writeFile(endpointPath, 'x'.repeat(513), 'utf8');
    await expect(
      readDevToolsEndpointFile(endpointPath, { processGeneration: 1, profileRealPath })
    ).rejects.toThrow(/512 bytes/i);
  });

  it('waits only for absence and resolves the first strict endpoint file', async () => {
    const profile = await mkdtemp(join(tmpdir(), 'missionpulse-endpoint-'));
    cleanupPaths.push(profile);
    const profileRealPath = await realpath(profile);
    const endpointPath = join(profile, 'DevToolsActivePort');
    const neverExits = new Promise<never>(() => undefined);

    const pending = waitForDevToolsEndpoint({
      childExited: neverExits,
      endpointPath,
      pollIntervalMs: 2,
      processGeneration: 4,
      profileRealPath,
      timeoutMs: 100,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    await writeFile(endpointPath, `9333\n/devtools/browser/${BROWSER_UUID}\n`, 'utf8');

    await expect(pending).resolves.toMatchObject({ port: 9333, processGeneration: 4 });
  });

  it('fails immediately when the owned child exits before endpoint admission', async () => {
    const profile = await mkdtemp(join(tmpdir(), 'missionpulse-endpoint-'));
    cleanupPaths.push(profile);
    const profileRealPath = await realpath(profile);

    await expect(
      waitForDevToolsEndpoint({
        childExited: Promise.resolve({ processGeneration: 5 }),
        endpointPath: join(profile, 'DevToolsActivePort'),
        pollIntervalMs: 2,
        processGeneration: 5,
        profileRealPath,
        timeoutMs: 100,
      })
    ).rejects.toThrow(/exited before.*endpoint/i);
  });

  it('does not retry an existing malformed endpoint file', async () => {
    const profile = await mkdtemp(join(tmpdir(), 'missionpulse-endpoint-'));
    cleanupPaths.push(profile);
    const profileRealPath = await realpath(profile);
    const endpointPath = join(profile, 'DevToolsActivePort');
    await writeFile(endpointPath, 'malformed\n', 'utf8');

    await expect(
      waitForDevToolsEndpoint({
        childExited: new Promise<never>(() => undefined),
        endpointPath,
        pollIntervalMs: 2,
        processGeneration: 6,
        profileRealPath,
        timeoutMs: 100,
      })
    ).rejects.toThrow(/exactly two canonical/i);
  });
});
