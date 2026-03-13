export type AiAvailability = 'available' | 'after-download' | 'no';

export async function isPromptApiAvailable(): Promise<AiAvailability> {
  try {
    const ai = (self as any).ai;
    if (!ai?.languageModel?.capabilities) return 'no';
    const caps = await ai.languageModel.capabilities();
    if (caps.available === 'readily') return 'available';
    if (caps.available === 'after-download') return 'after-download';
    return 'no';
  } catch {
    return 'no';
  }
}
