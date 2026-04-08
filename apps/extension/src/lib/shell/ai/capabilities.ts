/// <reference types="./chrome-ai.d.ts" />

export type AiAvailability = 'available' | 'after-download' | 'no';

/**
 * Check if the Chrome built-in AI Prompt API is available.
 *
 * @returns
 * - 'available': The model is ready to use.
 * - 'after-download': The model needs to be downloaded first.
 * - 'no': The API is not available on this device.
 */
export const isPromptApiAvailable = async (): Promise<AiAvailability> => {
  try {
    const ai = self.ai;
    if (!ai?.languageModel?.capabilities) {
      return 'no';
    }

    const caps = await ai.languageModel.capabilities();

    if (caps.available === 'readily') {
      return 'available';
    }
    if (caps.available === 'after-download') {
      return 'after-download';
    }
    return 'no';
  } catch {
    return 'no';
  }
};
