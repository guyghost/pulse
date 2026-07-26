import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DockerHostAdapterError,
  verifyCapturedOciImageLayout,
} from '../../../scripts/release-runtime/oci-host-adapter';

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function writeTarString(header: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > length) {
    throw new Error('fixture tar field overflow');
  }
  bytes.copy(header, offset);
}

function tarHeader(path: string, bytes: number, type: '0' | '5' | '2'): Buffer {
  const header = Buffer.alloc(512);
  writeTarString(header, 0, 100, path);
  writeTarString(header, 100, 8, type === '5' ? '0000555' : '0000444');
  writeTarString(header, 108, 8, '0000000');
  writeTarString(header, 116, 8, '0000000');
  writeTarString(header, 124, 12, `${bytes.toString(8).padStart(11, '0')}\0`);
  writeTarString(header, 136, 12, '00000000000');
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  writeTarString(header, 257, 8, 'ustar\0' + '00');
  writeTarString(header, 265, 32, 'root');
  writeTarString(header, 297, 32, 'root');
  const checksum = header.reduce((total, byte) => total + byte, 0);
  writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

interface TarFixtureEntry {
  path: string;
  bytes: Buffer;
  type?: '0' | '5' | '2';
}

function tar(entries: readonly TarFixtureEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const type = entry.type ?? '0';
    chunks.push(tarHeader(entry.path, type === '0' ? entry.bytes.byteLength : 0, type));
    if (type === '0') {
      chunks.push(entry.bytes);
      const padding = (512 - (entry.bytes.byteLength % 512)) % 512;
      if (padding > 0) {
        chunks.push(Buffer.alloc(padding));
      }
    }
  }
  chunks.push(Buffer.alloc(1_024));
  return Buffer.concat(chunks);
}

interface OciFixture {
  readonly archive: Buffer;
  readonly archiveSha256: string;
  readonly indexSha256: string;
  readonly manifestSha256: string;
  readonly configSha256: string;
  readonly layerSha256: readonly string[];
  readonly diffIdSha256: readonly string[];
}

function ociFixture(
  mutateIndex?: (index: Record<string, unknown>) => void,
  mutateEntries?: (entries: TarFixtureEntry[]) => void,
  mutateConfig?: (config: Record<string, unknown>) => void
): OciFixture {
  const layer = Buffer.from('one deterministic compressed layer', 'utf8');
  const layerSha256 = [sha256(layer)];
  const diffIdSha256 = ['7'.repeat(64)];
  const configValue: Record<string, unknown> = {
    architecture: 'amd64',
    os: 'linux',
    rootfs: { type: 'layers', diff_ids: diffIdSha256.map((digest) => `sha256:${digest}`) },
    config: {
      User: '65532:65532',
      Env: [
        'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'NODE_VERSION=22.23.1',
        'YARN_VERSION=1.22.22',
        'HOME=/nonexistent',
        'LANG=C',
        'LC_ALL=C',
        'TZ=UTC',
      ],
      Entrypoint: [
        '/usr/bin/env',
        '-i',
        'HOME=/nonexistent',
        'LANG=C',
        'LC_ALL=C',
        'TZ=UTC',
        '/usr/local/bin/node',
        '/inputs/release-controller.bundle.mjs',
      ],
      WorkingDir: '/outputs',
    },
  };
  mutateConfig?.(configValue);
  const config = jsonBytes(configValue);
  const configSha256 = sha256(config);
  const manifest = jsonBytes({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: `sha256:${configSha256}`,
      size: config.byteLength,
    },
    layers: [
      {
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        digest: `sha256:${layerSha256[0]}`,
        size: layer.byteLength,
      },
    ],
  });
  const manifestSha256 = sha256(manifest);
  const index: Record<string, unknown> = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [
      {
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest: `sha256:${manifestSha256}`,
        size: manifest.byteLength,
        annotations: {
          'io.containerd.image.name':
            'docker.io/library/missionpulse-release-runtime:sealed-candidate',
          'org.opencontainers.image.ref.name': 'sealed-candidate',
        },
        platform: { architecture: 'amd64', os: 'linux' },
      },
    ],
  };
  mutateIndex?.(index);
  const indexBytes = jsonBytes(index);
  const entries: TarFixtureEntry[] = [
    { path: 'blobs/', bytes: Buffer.alloc(0), type: '5' },
    { path: 'blobs/sha256/', bytes: Buffer.alloc(0), type: '5' },
    { path: `blobs/sha256/${configSha256}`, bytes: config },
    { path: `blobs/sha256/${layerSha256[0]}`, bytes: layer },
    { path: `blobs/sha256/${manifestSha256}`, bytes: manifest },
    { path: 'index.json', bytes: indexBytes },
    { path: 'oci-layout', bytes: jsonBytes({ imageLayoutVersion: '1.0.0' }) },
  ];
  mutateEntries?.(entries);
  const archive = tar(entries);
  return {
    archive,
    archiveSha256: sha256(archive),
    indexSha256: sha256(indexBytes),
    manifestSha256,
    configSha256,
    layerSha256,
    diffIdSha256,
  };
}

describe('captured OCI image-layout verifier', () => {
  it('accepts one exact bounded linux/amd64 graph', () => {
    const fixture = ociFixture();
    expect(
      verifyCapturedOciImageLayout(
        fixture.archive,
        fixture.archiveSha256,
        fixture.archive.byteLength
      )
    ).toMatchObject({
      archiveSha256: fixture.archiveSha256,
      archiveBytes: fixture.archive.byteLength,
      platform: 'linux/amd64',
      indexSha256: fixture.indexSha256,
      manifestSha256: fixture.manifestSha256,
      configSha256: fixture.configSha256,
      layerSha256: fixture.layerSha256,
      diffIdSha256: fixture.diffIdSha256,
    });
  });

  it('rejects a mismatched archive digest or byte count', () => {
    const fixture = ociFixture();
    expect(() =>
      verifyCapturedOciImageLayout(fixture.archive, '0'.repeat(64), fixture.archive.byteLength)
    ).toThrow(DockerHostAdapterError);
    expect(() =>
      verifyCapturedOciImageLayout(
        fixture.archive,
        fixture.archiveSha256,
        fixture.archive.byteLength + 1
      )
    ).toThrow(DockerHostAdapterError);
  });

  it.each([
    [
      'duplicate tar path',
      () =>
        ociFixture(undefined, (entries) => {
          const index = entries.find((entry) => entry.path === 'index.json');
          if (index === undefined) {
            throw new Error('missing fixture index');
          }
          entries.push({ ...index });
        }),
    ],
    [
      'duplicate blob alias',
      () =>
        ociFixture(undefined, (entries) => {
          const blob = entries.find((entry) => entry.path.startsWith('blobs/sha256/'));
          if (blob === undefined) {
            throw new Error('missing fixture blob');
          }
          entries.push({ ...blob, path: `${blob.path}/../${blob.path.split('/').at(-1)}` });
        }),
    ],
    [
      'extra root',
      () =>
        ociFixture(undefined, (entries) => {
          entries.push({ path: 'surprise', bytes: Buffer.from('sentinel') });
        }),
    ],
    [
      'duplicate JSON key',
      () =>
        ociFixture(undefined, (entries) => {
          const index = entries.find((entry) => entry.path === 'index.json');
          if (index === undefined) {
            throw new Error('missing fixture index');
          }
          index.bytes = Buffer.from('{"schemaVersion":2,"schemaVersion":2}', 'utf8');
        }),
    ],
    [
      'blob bytes different from its digest name',
      () =>
        ociFixture(undefined, (entries) => {
          const blob = entries.find(
            (entry) => entry.bytes.toString('utf8') === 'one deterministic compressed layer'
          );
          if (blob === undefined) {
            throw new Error('missing fixture layer');
          }
          blob.bytes = Buffer.from('hostile layer bytes', 'utf8');
        }),
    ],
    [
      'symbolic link',
      () =>
        ociFixture(undefined, (entries) => {
          entries.push({ path: 'alias', bytes: Buffer.alloc(0), type: '2' });
        }),
    ],
  ])('rejects a hostile OCI tar: %s', (_label, create) => {
    const fixture = create();
    expect(() =>
      verifyCapturedOciImageLayout(
        fixture.archive,
        fixture.archiveSha256,
        fixture.archive.byteLength
      )
    ).toThrow(DockerHostAdapterError);
  });

  it.each([
    [
      'annotation',
      (index: Record<string, unknown>) => {
        const manifest = (index.manifests as Array<Record<string, unknown>>)[0];
        (manifest.annotations as Record<string, unknown>)['org.opencontainers.image.created'] =
          '2026-07-17T00:00:00Z';
      },
    ],
    [
      'platform',
      (index: Record<string, unknown>) => {
        const manifest = (index.manifests as Array<Record<string, unknown>>)[0];
        (manifest.platform as Record<string, unknown>).architecture = 'arm64';
      },
    ],
    [
      'second index descriptor',
      (index: Record<string, unknown>) => {
        const manifests = index.manifests as Array<Record<string, unknown>>;
        manifests.push({ ...manifests[0] });
      },
    ],
  ])('rejects the wrong OCI %s', (_label, mutate) => {
    const fixture = ociFixture(mutate);
    expect(() =>
      verifyCapturedOciImageLayout(
        fixture.archive,
        fixture.archiveSha256,
        fixture.archive.byteLength
      )
    ).toThrow(DockerHostAdapterError);
  });

  it.each([
    [
      'entrypoint',
      (config: Record<string, unknown>) => {
        (config.config as Record<string, unknown>).Entrypoint = ['/bin/sh'];
      },
    ],
    [
      'user',
      (config: Record<string, unknown>) => {
        (config.config as Record<string, unknown>).User = '0:0';
      },
    ],
    [
      'environment',
      (config: Record<string, unknown>) => {
        (config.config as Record<string, unknown>).Env = ['NODE_OPTIONS=--require=/tmp/attack.cjs'];
      },
    ],
    [
      'working directory',
      (config: Record<string, unknown>) => {
        (config.config as Record<string, unknown>).WorkingDir = '/tmp';
      },
    ],
  ])('rejects a hostile OCI image config %s', (_label, mutateConfig) => {
    const fixture = ociFixture(undefined, undefined, mutateConfig);
    expect(() =>
      verifyCapturedOciImageLayout(
        fixture.archive,
        fixture.archiveSha256,
        fixture.archive.byteLength
      )
    ).toThrow(DockerHostAdapterError);
  });
});
