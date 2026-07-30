/// <reference types="./chrome-ai.d.ts" />

import type { AILanguageModel, AILanguageModelSession, PromptLanguageModel } from './chrome-ai';

export type AiAvailability = 'available' | 'after-download' | 'no';

type PromptRuntime =
  | {
      kind: 'current';
      model: PromptLanguageModel;
    }
  | {
      kind: 'legacy';
      model: AILanguageModel;
    };

const getPromptRuntime = (): PromptRuntime | null => {
  const current = (globalThis as typeof globalThis & { LanguageModel?: PromptLanguageModel })
    .LanguageModel;
  if (typeof current?.availability === 'function' && typeof current.create === 'function') {
    return { kind: 'current', model: current };
  }

  const legacyScope = globalThis as typeof globalThis & {
    ai?: { languageModel?: AILanguageModel };
  };
  const legacy = legacyScope.ai?.languageModel;
  if (typeof legacy?.capabilities === 'function' && typeof legacy.create === 'function') {
    return { kind: 'legacy', model: legacy };
  }

  return null;
};

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
    const runtime = getPromptRuntime();
    if (!runtime) {
      return 'no';
    }

    if (runtime.kind === 'current') {
      // Current Chromium builds warn when language negotiation options are
      // supplied even though session creation below does not use them.
      const availability = await runtime.model.availability();

      if (availability === 'available') {
        return 'available';
      }
      if (availability === 'downloadable' || availability === 'downloading') {
        return 'after-download';
      }
      return 'no';
    }

    const caps = await runtime.model.capabilities();
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

export const createPromptSession = async (): Promise<AILanguageModelSession> => {
  const runtime = getPromptRuntime();
  if (!runtime) {
    throw new Error('Prompt API unavailable');
  }

  return runtime.model.create();
};
