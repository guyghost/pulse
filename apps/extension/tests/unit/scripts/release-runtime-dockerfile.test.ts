import { execFile as execFileCallback } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const dockerfilePath = resolve(process.cwd(), 'release/Dockerfile');
const execFile = promisify(execFileCallback);

interface TarEntryFixture {
  readonly name: string;
  readonly namePaddingAfterNul?: string;
  readonly type?: '0' | '1' | '2' | '3' | '4' | '5' | '6';
  readonly linkName?: string;
  readonly bytes?: Buffer;
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const octal = value.toString(8).padStart(length - 1, '0');
  buffer.write(octal, offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}

function tarArchive(entries: readonly TarEntryFixture[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    const bytes = entry.bytes ?? Buffer.alloc(0);
    header.write(entry.name, 0, 100, 'utf8');
    if (entry.namePaddingAfterNul !== undefined) {
      header.write(entry.namePaddingAfterNul, Buffer.byteLength(entry.name) + 1, 100, 'utf8');
    }
    writeOctal(header, 100, 8, entry.type === '5' ? 0o555 : 0o444);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, bytes.byteLength);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header.write(entry.type ?? '0', 156, 1, 'ascii');
    if (entry.linkName) {
      header.write(entry.linkName, 157, 100, 'utf8');
    }
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    const checksum = header.reduce((total, byte) => total + byte, 0);
    writeOctal(header, 148, 8, checksum);
    chunks.push(header, bytes);
    const padding = (512 - (bytes.byteLength % 512)) % 512;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(1_024));
  return gzipSync(Buffer.concat(chunks), { mtime: 0 });
}

function embeddedArchivePolicy(recipe: string): string {
  const match = /RUN node <<'ARCHIVE_POLICY'\n([\s\S]*?)\nARCHIVE_POLICY/.exec(recipe);
  if (!match) {
    throw new Error('Embedded archive policy is missing.');
  }
  return match[1];
}

async function executeArchivePolicy(archive: Buffer): Promise<void> {
  const recipe = await readFile(dockerfilePath, 'utf8');
  const directory = await mkdtemp(join(tmpdir(), 'missionpulse-archive-policy-'));
  const archivePath = join(directory, 'fixture.tar.gz');
  try {
    await writeFile(archivePath, archive);
    await execFile(process.execPath, ['-e', embeddedArchivePolicy(recipe)], {
      env: { MISSIONPULSE_ARCHIVE_PATH: archivePath },
      timeout: 10_000,
      maxBuffer: 1_048_576,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('release execution image recipe', () => {
  it('starts from the exact linux/amd64 Node manifest and never fetches build material', async () => {
    const recipe = await readFile(dockerfilePath, 'utf8');

    expect(recipe).not.toMatch(/^#\s*syntax=/m);
    expect(recipe).toContain(
      'FROM --platform=linux/amd64 node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27'
    );
    expect(recipe).not.toMatch(/\b(?:ADD\s+https?:|curl|wget|apt-get|apk|dnf|yum)\b/i);
  });

  it('copies and re-proves only the exact authorized standalone Python archive', async () => {
    const recipe = await readFile(dockerfilePath, 'utf8');

    expect(recipe).not.toMatch(/^ARG\s+(?:NODE|PYTHON)_/m);
    expect(recipe).toContain(
      'COPY cpython-3.14.5+20260510-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz'
    );
    expect(recipe).toContain('35955046');
    expect(recipe).toContain('dc10977b0db3bef1ee2275107fde6fe9c148135b556fa352e83c6baa67d17ed6');
    expect(recipe).toContain('4758');
    expect(recipe).toContain('3510');
    expect(recipe).toContain('201');
    expect(recipe).toContain('1047');
    expect(recipe).toContain('100940658');
    expect(recipe).toContain('82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8');
    expect(recipe).toContain('a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da');
    expect(recipe.indexOf("RUN node <<'ARCHIVE_POLICY'")).toBeGreaterThan(0);
    expect(recipe.indexOf("RUN node <<'ARCHIVE_POLICY'")).toBeLessThan(
      recipe.indexOf('tar --extract')
    );
  });

  it('executes every embedded JavaScript heredoc with the Node interpreter', async () => {
    const recipe = await readFile(dockerfilePath, 'utf8');

    expect(recipe.match(/^RUN node <<'(?:NODE|ARCHIVE_POLICY)'$/gm)).toHaveLength(3);
    expect(recipe).not.toMatch(/^RUN <<'(?:NODE|ARCHIVE_POLICY)'$/m);
  });

  it('prevalidates archive paths, aliases, object types, and link targets before extraction', async () => {
    await expect(
      executeArchivePolicy(
        tarArchive([
          { name: 'python/', namePaddingAfterNul: 'ignored-field-padding', type: '5' },
          { name: 'python/bin/', type: '5' },
          { name: 'python/bin/python3.14', bytes: Buffer.from('ELF') },
          { name: 'python/bin/python3', type: '2', linkName: 'python3.14' },
        ])
      )
    ).resolves.toBeUndefined();

    const hostileArchives = [
      tarArchive([{ name: '/python/bin/python3.14', bytes: Buffer.from('ELF') }]),
      tarArchive([{ name: 'python/../escape', bytes: Buffer.from('x') }]),
      tarArchive([
        { name: 'python/duplicate', bytes: Buffer.from('one') },
        { name: 'python/duplicate', bytes: Buffer.from('two') },
      ]),
      tarArchive([{ name: 'python/hardlink', type: '1', linkName: 'python/bin/python3.14' }]),
      tarArchive([{ name: 'python/device', type: '3' }]),
      tarArchive([{ name: 'python/link', type: '2', linkName: '../../escape' }]),
    ];
    for (const archive of hostileArchives) {
      await expect(executeArchivePolicy(archive)).rejects.toThrow();
    }
  });

  it('inventories extracted objects without following links or accepting hard-link aliases', async () => {
    const recipe = await readFile(dockerfilePath, 'utf8');
    const inventory = recipe.slice(recipe.indexOf('tar --extract'));

    expect(inventory).toContain('O_NOFOLLOW');
    expect(inventory).toContain('hard-link alias');
    expect(inventory).not.toContain('readFileSync(path)');
  });

  it('ships a non-root read-only runtime entrypoint with no host interpreter fallback', async () => {
    const recipe = await readFile(dockerfilePath, 'utf8');

    expect(recipe).toContain('mkdir -p /inputs/dist /inputs/evidence /outputs');
    expect(recipe).toContain('touch /inputs/release-controller.bundle.mjs');
    expect(recipe).toContain('USER 65532:65532');
    expect(recipe).toContain(
      'ENTRYPOINT ["/usr/bin/env", "-i", "HOME=/nonexistent", "LANG=C", "LC_ALL=C", "TZ=UTC", "/usr/local/bin/node", "/inputs/release-controller.bundle.mjs"]'
    );
    expect(recipe).toContain('chmod -R a-w /opt/missionpulse-python/python');
    expect(recipe).not.toMatch(
      /^\s*(?:RUN|CMD|ENTRYPOINT).*?(?:^|[\s"'])python(?:3(?:\.\d+)?)?(?:[\s"',]|$)/im
    );
  });
});
