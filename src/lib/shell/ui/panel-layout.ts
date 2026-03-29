export type PanelSide = 'left' | 'right';

interface SidePanelLayout {
  position?: 'left' | 'right';
}

interface SidePanelWithLayout {
  getLayout(): Promise<SidePanelLayout>;
}

export async function getPanelSide(): Promise<PanelSide> {
  try {
    const sidePanel = chrome.sidePanel as unknown as SidePanelWithLayout | undefined;
    if (!sidePanel?.getLayout) return 'right';
    const layout = await sidePanel.getLayout();
    return layout?.position === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}
