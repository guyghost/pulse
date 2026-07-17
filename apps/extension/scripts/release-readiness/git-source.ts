import { execFileSync } from 'node:child_process';
import { closeSync, constants, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ReleaseCandidateSourcePort } from './factory';

const MAX_GIT_BLOB_BYTES = 67_108_864;
const MAX_BUILT_MANIFEST_BYTES = 1_048_576;
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

export class GitReleaseCandidateSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitReleaseCandidateSourceError';
  }
}

export class GitReleaseCandidateSourcePort implements ReleaseCandidateSourcePort {
  readonly #workspaceRoot: string;
  readonly #builtManifestPath: string;

  constructor(options: { readonly workspaceRoot: string; readonly builtManifestPath: string }) {
    const workspaceRoot = resolve(options.workspaceRoot);
    const rootStat = lstatSync(workspaceRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new GitReleaseCandidateSourceError('Git workspace must be a real directory.');
    }
    this.#workspaceRoot = realpathSync(workspaceRoot);
    this.#builtManifestPath = resolve(options.builtManifestPath);
  }

  readGitBlob(
    request: Parameters<ReleaseCandidateSourcePort['readGitBlob']>[0]
  ): Uint8Array | null {
    this.#assertExactCleanSource(request);
    try {
      return this.#gitBuffer(['show', `${request.sourceCommit}:${request.path}`]);
    } catch {
      return null;
    }
  }

  readBuiltManifest(
    request: Parameters<ReleaseCandidateSourcePort['readBuiltManifest']>[0]
  ): Uint8Array | null {
    this.#assertExactCleanSource(request);
    let descriptor: number | null = null;
    try {
      const stat = lstatSync(this.#builtManifestPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BUILT_MANIFEST_BYTES) {
        throw new GitReleaseCandidateSourceError(
          'Built manifest must be one bounded regular no-follow file.'
        );
      }
      descriptor = openSync(this.#builtManifestPath, constants.O_RDONLY | NO_FOLLOW);
      const bytes = readFileSync(descriptor);
      return bytes.byteLength === 0 ? null : bytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    } finally {
      if (descriptor !== null) {
        closeSync(descriptor);
      }
    }
  }

  #assertExactCleanSource(request: {
    readonly sourceCommit: string;
    readonly gitTreeObjectId: string;
  }): void {
    if (!GIT_OBJECT_ID.test(request.sourceCommit) || !GIT_OBJECT_ID.test(request.gitTreeObjectId)) {
      throw new GitReleaseCandidateSourceError('Git source identity is not canonical.');
    }
    try {
      const head = this.#gitText(['rev-parse', '--verify', 'HEAD^{commit}']);
      const commit = this.#gitText(['rev-parse', '--verify', `${request.sourceCommit}^{commit}`]);
      const tree = this.#gitText(['rev-parse', '--verify', `${commit}^{tree}`]);
      if (head !== request.sourceCommit || commit !== request.sourceCommit) {
        throw new GitReleaseCandidateSourceError(
          'Release source commit must be the exact clean HEAD.'
        );
      }
      if (tree !== request.gitTreeObjectId) {
        throw new GitReleaseCandidateSourceError('Release source commit/tree binding drifted.');
      }
      this.#gitBuffer(['diff', '--quiet', '--exit-code', request.sourceCommit, '--']);
      this.#gitBuffer(['diff', '--cached', '--quiet', '--exit-code', request.sourceCommit, '--']);
      if (
        this.#gitBuffer(['status', '--porcelain=v2', '--untracked-files=all', '--ignored=no'])
          .byteLength !== 0
      ) {
        throw new GitReleaseCandidateSourceError(
          'Release source contains untracked or otherwise uncommitted files.'
        );
      }
    } catch (error) {
      if (error instanceof GitReleaseCandidateSourceError) {
        throw error;
      }
      throw new GitReleaseCandidateSourceError(
        'Release source is not the exact clean commit/tree.'
      );
    }
  }

  #gitText(args: readonly string[]): string {
    return this.#gitBuffer(args).toString('utf8').trim();
  }

  #gitBuffer(args: readonly string[]): Buffer {
    return execFileSync('git', args, {
      cwd: this.#workspaceRoot,
      encoding: 'buffer',
      maxBuffer: MAX_GIT_BLOB_BYTES,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GIT_CONFIG_NOSYSTEM: '1',
        LC_ALL: 'C',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  }
}
