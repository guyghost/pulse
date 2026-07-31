import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { RELEASE_DESCRIPTOR_SCANNER } from '../../../scripts/canonical-artifact';

/** Returns true when Python 3.14.5 (the pinned release scanner) is reachable. */
export function hasPinnedPython(): boolean {
  const cmd = process.env.PULSE_RELEASE_PYTHON ?? 'python3';
  try {
    const version = execFileSync(
      cmd,
      ['-c', 'import platform; print(platform.python_version(), end="")'],
      { encoding: 'utf8', timeout: 5_000, env: { PATH: process.env.PATH ?? '' } }
    ).trim();
    return version === RELEASE_DESCRIPTOR_SCANNER.pythonVersion;
  } catch {
    return false;
  }
}

/** Returns true when the pinned Playwright Chromium binary is present on disk. */
export function hasPinnedChromium(): boolean {
  return existsSync('/home/runner/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
}
