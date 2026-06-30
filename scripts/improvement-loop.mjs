#!/usr/bin/env node
/**
 * Boucle d'amélioration locale — gate unifiée avant PR.
 */

import { execSync } from 'node:child_process';

const steps = [
  { name: 'format:check', command: 'pnpm format:check' },
  { name: 'lint', command: 'pnpm lint' },
  { name: 'typecheck', command: 'pnpm typecheck' },
  { name: 'test', command: 'pnpm test' },
  { name: 'regression', command: 'pnpm --filter @pulse/extension test:regression' },
  { name: 'health-check', command: 'pnpm --filter @pulse/extension health-check' },
  { name: 'build', command: 'pnpm build' },
];

let failed = false;

console.log('MissionPulse — improvement loop\n');

for (const step of steps) {
  process.stdout.write(`→ ${step.name}... `);
  try {
    execSync(step.command, { stdio: 'pipe', encoding: 'utf8' });
    console.log('OK');
  } catch (error) {
    failed = true;
    console.log('FAIL');
    const output = error instanceof Error && 'stdout' in error ? String(error.stdout ?? '') : '';
    const errOutput = error instanceof Error && 'stderr' in error ? String(error.stderr ?? '') : '';
    if (output) console.log(output);
    if (errOutput) console.error(errOutput);
    if (error instanceof Error && !output && !errOutput) {
      console.error(error.message);
    }
  }
}

console.log(failed ? '\nImprovement loop: FAIL' : '\nImprovement loop: PASS');
process.exit(failed ? 1 : 0);
