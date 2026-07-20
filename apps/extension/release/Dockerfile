FROM --platform=linux/amd64 node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27

COPY cpython-3.14.5+20260510-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz /tmp/python-runtime.tar.gz

RUN node <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync, statSync } = require('node:fs');

const path = '/tmp/python-runtime.tar.gz';
const expectedBytes = 35955046;
const expectedSha = 'dc10977b0db3bef1ee2275107fde6fe9c148135b556fa352e83c6baa67d17ed6';
const stats = statSync(path, { bigint: true });
if (!stats.isFile() || stats.size !== BigInt(expectedBytes)) {
  throw new Error('Python archive byte count mismatch.');
}
const bytes = readFileSync(path);
if (createHash('sha256').update(bytes).digest('hex') !== expectedSha) {
  throw new Error('Python archive digest mismatch.');
}
NODE

RUN node <<'ARCHIVE_POLICY'
const { readFileSync } = require('node:fs');
const { posix } = require('node:path');
const { gunzipSync } = require('node:zlib');

const archivePath = process.env.MISSIONPULSE_ARCHIVE_PATH ?? '/tmp/python-runtime.tar.gz';
const compressed = readFileSync(archivePath);
if (compressed.byteLength === 0 || compressed.byteLength > 67_108_864) {
  throw new Error('Python archive is empty or exceeds its compressed bound.');
}
const archive = gunzipSync(compressed, { maxOutputLength: 536_870_912 });
if (archive.byteLength === 0 || archive.byteLength % 512 !== 0) {
  throw new Error('Python archive has a malformed block boundary.');
}

function field(buffer, offset, length, label) {
  const bytes = buffer.subarray(offset, offset + length);
  const terminator = bytes.indexOf(0);
  const valueBytes = terminator < 0 ? bytes : bytes.subarray(0, terminator);
  // GNU tar treats fixed-width path/link fields as terminated at the first NUL.
  // The content-authorized archive contains non-zero padding after that terminator,
  // so the preflight must follow the same pathname authority as extraction.
  const value = valueBytes.toString('utf8');
  if (Buffer.from(value, 'utf8').compare(valueBytes) !== 0 || value.includes('\0')) {
    throw new Error(`${label} is not canonical UTF-8.`);
  }
  return value;
}

function octal(buffer, offset, length, label) {
  const raw = buffer.subarray(offset, offset + length).toString('ascii').replace(/[\0 ]+$/g, '');
  if (!/^[0-7]+$/.test(raw)) throw new Error(`${label} is not strict octal.`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is unbounded.`);
  return value;
}

function validateHeaderChecksum(header) {
  const expected = octal(header, 148, 8, 'tar checksum');
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  const actual = copy.reduce((total, byte) => total + byte, 0);
  if (actual !== expected) throw new Error('Tar header checksum mismatch.');
}

function canonicalEntryPath(raw) {
  if (
    raw.length === 0 ||
    raw.length > 4_096 ||
    raw.startsWith('/') ||
    raw.includes('\\') ||
    raw.includes('\0')
  ) {
    throw new Error('Python archive contains an unsafe path.');
  }
  const stripped = raw.replace(/\/+$/g, '');
  const canonical = posix.normalize(stripped);
  if (
    stripped.length === 0 ||
    canonical !== stripped ||
    (canonical !== 'python' && !canonical.startsWith('python/'))
  ) {
    throw new Error('Python archive path escapes its authorized root.');
  }
  return canonical;
}

function canonicalSymlinkTarget(entryPath, rawTarget) {
  if (
    rawTarget.length === 0 ||
    rawTarget.length > 4_096 ||
    rawTarget.startsWith('/') ||
    rawTarget.includes('\\') ||
    rawTarget.includes('\0')
  ) {
    throw new Error('Python archive contains an unsafe symlink target.');
  }
  const resolved = posix.normalize(posix.join(posix.dirname(entryPath), rawTarget));
  if (resolved !== 'python' && !resolved.startsWith('python/')) {
    throw new Error('Python archive symlink escapes its authorized root.');
  }
}

function extensionText(data, label) {
  const terminator = data.indexOf(0);
  const bytes = terminator < 0 ? data : data.subarray(0, terminator);
  if (terminator >= 0 && data.subarray(terminator + 1).some((byte) => byte !== 0)) {
    throw new Error(`${label} contains trailing data.`);
  }
  const value = bytes.toString('utf8').replace(/\n$/, '');
  if (Buffer.from(value, 'utf8').compare(bytes.subarray(0, Buffer.byteLength(value))) !== 0) {
    throw new Error(`${label} is not canonical UTF-8.`);
  }
  return value;
}

function parsePax(data, global) {
  const values = {};
  let offset = 0;
  while (offset < data.byteLength) {
    const space = data.indexOf(0x20, offset);
    if (space <= offset) throw new Error('Malformed PAX record length.');
    const lengthText = data.subarray(offset, space).toString('ascii');
    if (!/^[1-9]\d*$/.test(lengthText)) throw new Error('Malformed PAX record length.');
    const length = Number(lengthText);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || end > data.byteLength || data[end - 1] !== 0x0a) {
      throw new Error('Truncated PAX record.');
    }
    const record = data.subarray(space + 1, end - 1).toString('utf8');
    if (Buffer.from(record, 'utf8').byteLength !== end - space - 2) {
      throw new Error('PAX record is not canonical UTF-8.');
    }
    const equals = record.indexOf('=');
    if (equals <= 0) throw new Error('Malformed PAX record.');
    const key = record.slice(0, equals);
    const value = record.slice(equals + 1);
    if (/sparse/i.test(key) || key === 'size') {
      throw new Error('PAX record can change archive object semantics.');
    }
    if (key === 'path' || key === 'linkpath') {
      if (global || Object.hasOwn(values, key)) throw new Error('Ambiguous PAX path authority.');
      values[key] = value;
    }
    offset = end;
  }
  return values;
}

const seen = new Set();
let pending = {};
let offset = 0;
let zeroBlocks = 0;
let entryCount = 0;
while (offset < archive.byteLength) {
  const header = archive.subarray(offset, offset + 512);
  offset += 512;
  if (header.every((byte) => byte === 0)) {
    zeroBlocks += 1;
    if (zeroBlocks === 2) {
      if (archive.subarray(offset).some((byte) => byte !== 0)) {
        throw new Error('Python archive contains data after its terminator.');
      }
      break;
    }
    continue;
  }
  if (zeroBlocks !== 0) throw new Error('Python archive contains an ambiguous zero block.');
  validateHeaderChecksum(header);
  const size = octal(header, 124, 12, 'tar entry size');
  const paddedSize = Math.ceil(size / 512) * 512;
  if (offset + paddedSize > archive.byteLength) throw new Error('Truncated tar entry body.');
  const data = archive.subarray(offset, offset + size);
  offset += paddedSize;
  const type = String.fromCharCode(header[156] || 0x30);
  const name = field(header, 0, 100, 'tar name');
  const prefix = field(header, 345, 155, 'tar prefix');
  const headerPath = prefix.length === 0 ? name : `${prefix}/${name}`;
  const headerLink = field(header, 157, 100, 'tar link name');

  if (type === 'x' || type === 'g') {
    const pax = parsePax(data, type === 'g');
    if (type === 'x') pending = { ...pending, ...pax };
    continue;
  }
  if (type === 'L' || type === 'K') {
    const key = type === 'L' ? 'path' : 'linkpath';
    if (Object.hasOwn(pending, key)) throw new Error('Ambiguous GNU path authority.');
    pending[key] = extensionText(data, `GNU ${key}`);
    continue;
  }
  if (!['0', '2', '5'].includes(type)) {
    throw new Error('Python archive contains a hardlink or special object.');
  }
  const entryPath = canonicalEntryPath(pending.path ?? headerPath);
  const linkTarget = pending.linkpath ?? headerLink;
  pending = {};
  if (seen.has(entryPath)) throw new Error('Python archive contains a duplicate path.');
  seen.add(entryPath);
  entryCount += 1;
  if (entryCount > 20_000) throw new Error('Python archive entry count exceeds its bound.');
  if (type === '2') canonicalSymlinkTarget(entryPath, linkTarget);
  if (type !== '0' && size !== 0) throw new Error('Non-file tar entry contains data.');
}
if (zeroBlocks !== 2 || Object.keys(pending).length !== 0 || entryCount === 0) {
  throw new Error('Python archive termination or extension state is ambiguous.');
}
ARCHIVE_POLICY

RUN mkdir -p /opt/missionpulse-python \
  && tar --extract --gzip --file=/tmp/python-runtime.tar.gz \
    --directory=/opt/missionpulse-python \
    --no-same-owner --no-same-permissions --delay-directory-restore \
    python \
  && chmod -R a-w /opt/missionpulse-python/python \
  && rm /tmp/python-runtime.tar.gz

RUN node <<'NODE'
const { createHash } = require('node:crypto');
const { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readlinkSync, readdirSync } = require('node:fs');
const { join, relative } = require('node:path');

const root = '/opt/missionpulse-python';
const runtimeRoot = join(root, 'python');
const entries = [];
let fileCount = 0;
let directoryCount = 0;
let symlinkCount = 0;
let regularFileBytes = 0;
let executableDigest = null;
const regularInodes = new Set();

function canonicalPath(path) {
  return relative(root, path).split('/').join('/');
}

function scan(path, includeSelf = true) {
  const stats = lstatSync(path);
  const entryPath = canonicalPath(path);
  if (!entryPath || entryPath.startsWith('../') || entryPath.includes('\\')) {
    throw new Error('Unsafe Python runtime path.');
  }
  if (stats.isDirectory()) {
    const mode = (stats.mode & 0o7777).toString(8).padStart(4, '0');
    if (includeSelf) {
      directoryCount += 1;
      entries.push([entryPath, 'd', mode, 0, '']);
    }
    const children = readdirSync(path).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    for (const child of children) scan(join(path, child));
    return;
  }
  if (stats.isFile()) {
    const inodeKey = `${stats.dev}:${stats.ino}`;
    if (regularInodes.has(inodeKey)) throw new Error('Python runtime contains a hard-link alias.');
    regularInodes.add(inodeKey);
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes;
    try {
      const before = fstatSync(descriptor);
      bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor);
      if (
        before.dev !== stats.dev || before.ino !== stats.ino || before.mode !== stats.mode ||
        before.size !== stats.size || before.mtimeMs !== stats.mtimeMs || before.ctimeMs !== stats.ctimeMs ||
        after.dev !== before.dev || after.ino !== before.ino || after.mode !== before.mode ||
        after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs ||
        bytes.byteLength !== before.size
      ) throw new Error('Python runtime file changed during no-follow capture.');
    } finally {
      closeSync(descriptor);
    }
    fileCount += 1;
    regularFileBytes += bytes.byteLength;
    const fileDigest = createHash('sha256').update(bytes).digest('hex');
    if (entryPath === 'python/bin/python3.14') executableDigest = fileDigest;
    entries.push([
      entryPath,
      'f',
      (stats.mode & 0o7777).toString(8).padStart(4, '0'),
      bytes.byteLength,
      fileDigest,
    ]);
    return;
  }
  if (stats.isSymbolicLink()) {
    const target = readlinkSync(path, 'utf8');
    symlinkCount += 1;
    entries.push([entryPath, 'l', 'link', Buffer.byteLength(target), target]);
    return;
  }
  throw new Error('Forbidden Python runtime entry type.');
}

scan(runtimeRoot, false);
entries.sort((left, right) => Buffer.compare(Buffer.from(left[0]), Buffer.from(right[0])));
const digest = createHash('sha256')
  .update(JSON.stringify(['missionpulse-python-runtime-tree', 1, entries]))
  .digest('hex');
if (executableDigest === null) throw new Error('Python executable is missing from inventory.');

const expected = {
  entries: 4758,
  files: 3510,
  directories: 201,
  symlinks: 1047,
  bytes: 100940658,
  tree: '82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8',
  executable: 'a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da',
};
const actual = {
  entries: entries.length,
  files: fileCount,
  directories: directoryCount,
  symlinks: symlinkCount,
  bytes: regularFileBytes,
  tree: digest,
  executable: executableDigest,
};
if (
  actual.entries !== expected.entries ||
  actual.files !== expected.files ||
  actual.directories !== expected.directories ||
  actual.symlinks !== expected.symlinks ||
  actual.bytes !== expected.bytes ||
  actual.tree !== expected.tree ||
  actual.executable !== expected.executable
) {
  throw new Error(`Python runtime inventory mismatch: ${JSON.stringify(actual)}`);
}
NODE

RUN mkdir -p /inputs/dist /inputs/evidence /outputs \
  && touch /inputs/release-controller.bundle.mjs \
  && chmod 0555 /inputs /inputs/dist /inputs/evidence \
  && chmod 0444 /inputs/release-controller.bundle.mjs \
  && chmod 0755 /outputs

ENV HOME=/nonexistent LANG=C LC_ALL=C TZ=UTC
WORKDIR /outputs
USER 65532:65532
ENTRYPOINT ["/usr/bin/env", "-i", "HOME=/nonexistent", "LANG=C", "LC_ALL=C", "TZ=UTC", "/usr/local/bin/node", "/inputs/release-controller.bundle.mjs"]
