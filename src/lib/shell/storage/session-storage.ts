export type ScanState = 'idle' | 'scanning' | 'error';

export async function getScanState(): Promise<ScanState> {
  const result = await chrome.storage.session.get(['scanState']);
  return (result.scanState as ScanState) ?? 'idle';
}

export async function setScanState(state: ScanState): Promise<void> {
  await chrome.storage.session.set({ scanState: state });
}

export async function getNewMissionCount(): Promise<number> {
  const result = await chrome.storage.session.get(['newMissionCount']);
  return (result.newMissionCount as number) ?? 0;
}

export async function setNewMissionCount(count: number): Promise<void> {
  await chrome.storage.session.set({ newMissionCount: count });
}

export async function resetNewMissionCount(): Promise<void> {
  await chrome.storage.session.set({ newMissionCount: 0 });
}
