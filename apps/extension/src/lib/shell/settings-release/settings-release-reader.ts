import type { SettingsReleaseSnapshot } from './settings-release.contract';

export type SettingsReleaseSnapshotReader = () => Promise<SettingsReleaseSnapshot>;

let reader: SettingsReleaseSnapshotReader | null = null;

export function installSettingsReleaseSnapshotReader(next: SettingsReleaseSnapshotReader): void {
  if (reader !== null && reader !== next) {
    throw new Error('Settings release snapshot reader already installed.');
  }
  reader = next;
}

export async function readSettingsReleaseSnapshot(): Promise<SettingsReleaseSnapshot> {
  if (reader === null) {
    throw new Error('Settings release snapshot reader is unavailable.');
  }
  return structuredClone(await reader());
}

export function resetSettingsReleaseSnapshotReaderForTests(): void {
  if (import.meta.env.MODE !== 'test') {
    throw new Error('Settings release reader reset is test-only.');
  }
  reader = null;
}
