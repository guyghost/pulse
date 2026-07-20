import { createHash } from 'node:crypto';
import { constants as fsConstants, type BigIntStats } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';

export class SecureCaptureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SecureCaptureError';
  }
}

export interface CapturedRegularFile {
  readonly bytes: Buffer;
  readonly byteLength: number;
  readonly sha256: string;
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.rdev === right.rdev &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function assertCapturePath(path: string, label: string): void {
  if (
    path.length === 0 ||
    path.length > 4_096 ||
    !isAbsolute(path) ||
    normalize(path) !== path ||
    /[\0\r\n]/.test(path)
  ) {
    throw new SecureCaptureError(`${label} must be one canonical absolute path.`);
  }
}

export async function captureBoundedRegularFile(
  path: string,
  label: string,
  maxBytes: number,
  afterRead?: () => void | Promise<void>
): Promise<CapturedRegularFile> {
  assertCapturePath(path, label);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new SecureCaptureError(`${label} has an invalid capture bound.`);
  }
  let handle: FileHandle | undefined;
  let reopened: FileHandle | undefined;
  try {
    if ((await realpath(path)) !== path) {
      throw new SecureCaptureError(`${label} must already be its no-link real path.`);
    }
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
    handle = await open(path, flags);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maxBytes)) {
      throw new SecureCaptureError(`${label} is not one bounded regular file.`);
    }
    const bytes = await handle.readFile();
    if (bytes.byteLength !== Number(before.size)) {
      throw new SecureCaptureError(`${label} returned a truncated byte capture.`);
    }
    await afterRead?.();
    const heldAfter = await handle.stat({ bigint: true });
    if ((await realpath(path)) !== path) {
      throw new SecureCaptureError(`${label} became a path alias during capture.`);
    }
    reopened = await open(path, flags);
    const pathAfter = await reopened.stat({ bigint: true });
    if (
      !sameIdentity(before, heldAfter) ||
      !sameIdentity(before, pathAfter) ||
      !pathAfter.isFile()
    ) {
      throw new SecureCaptureError(`${label} changed while its bytes were captured.`);
    }
    return Object.freeze({
      bytes,
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch (error) {
    if (error instanceof SecureCaptureError) {
      throw error;
    }
    throw new SecureCaptureError(`${label} could not be captured without following links.`, {
      cause: error,
    });
  } finally {
    await reopened?.close().catch(() => undefined);
    await handle?.close().catch(() => undefined);
  }
}
