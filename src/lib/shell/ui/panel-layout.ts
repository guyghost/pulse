export type PanelSide = 'left' | 'right';

export async function getPanelSide(): Promise<PanelSide> {
  try {
    const layout = await (chrome.sidePanel as any).getLayout();
    return layout?.position === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}
