export type ReleaseHostGateId =
  | 'format'
  | 'lint'
  | 'typecheck'
  | 'unit'
  | 'verify-source-manifest'
  | 'build-ui'
  | 'build-extension'
  | 'verify-built-manifest-before-mv3'
  | 'playwright-packaged-mv3'
  | 'verify-built-manifest-after-mv3';

export interface ReleaseHostGateCommandV1 {
  readonly id: ReleaseHostGateId;
  readonly args: readonly string[];
  readonly producesDist: boolean;
}

/**
 * Closed producer-owned command plan from the approved release models.
 * The workflow invokes the producer once; it never duplicates these commands.
 * The production adapter prefixes every tuple with its retained Node and pnpm
 * executable authorities before execution.
 */
export const RELEASE_HOST_GATE_PLAN_V1: readonly ReleaseHostGateCommandV1[] = Object.freeze([
  { id: 'format', args: ['format:check'], producesDist: false },
  { id: 'lint', args: ['lint'], producesDist: false },
  { id: 'typecheck', args: ['typecheck'], producesDist: false },
  { id: 'unit', args: ['test'], producesDist: false },
  {
    id: 'verify-source-manifest',
    args: ['--filter', '@pulse/extension', 'verify-manifest', 'src/manifest.json'],
    producesDist: false,
  },
  { id: 'build-ui', args: ['--filter', '@pulse/ui', 'build'], producesDist: false },
  {
    id: 'build-extension',
    args: ['--filter', '@pulse/extension', 'build'],
    producesDist: true,
  },
  {
    id: 'verify-built-manifest-before-mv3',
    args: ['--filter', '@pulse/extension', 'verify-manifest', 'dist/manifest.json', '--post-build'],
    producesDist: false,
  },
  {
    id: 'playwright-packaged-mv3',
    args: [
      '--filter',
      '@pulse/extension',
      'exec',
      'playwright',
      'test',
      '--config=playwright.mv3.config.ts',
      '--reporter=json',
    ],
    producesDist: false,
  },
  {
    id: 'verify-built-manifest-after-mv3',
    args: ['--filter', '@pulse/extension', 'verify-manifest', 'dist/manifest.json', '--post-build'],
    producesDist: false,
  },
]);
