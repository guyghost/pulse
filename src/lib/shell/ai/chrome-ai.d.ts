/**
 * Chrome Built-in AI API (Prompt API) type declarations.
 *
 * @see https://developer.chrome.com/docs/ai/built-in
 *
 * This API is available in Chrome 127+ with the "Prompt API for Gemini Nano"
 * origin trial flag enabled, or in Chrome 130+ by default.
 */

/**
 * Language model availability status.
 * - 'readily': The model is available and ready to use.
 * - 'after-download': The model needs to be downloaded first.
 * - 'no': The model is not available on this device.
 */
export type AIAvailability = 'readily' | 'after-download' | 'no';

/**
 * Capabilities returned by ai.languageModel.capabilities()
 */
export interface AILanguageModelCapabilities {
  available: AIAvailability;
}

/**
 * Session options for creating a language model session.
 */
export interface AISessionOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
}

/**
 * A language model session instance.
 * Created via ai.languageModel.create()
 */
export interface AILanguageModelSession {
  /**
   * Send a prompt to the model and get a response.
   * @param input The text prompt to send.
   * @returns The model's response as a string.
   */
  prompt(input: string): Promise<string>;

  /**
   * Stream a prompt to the model.
   * @param input The text prompt to send.
   * @returns A ReadableStream of the response.
   */
  promptStreaming(input: string): Promise<ReadableStream<string>>;

  /**
   * Destroy the session and free resources.
   * Should be called when done with the session.
   */
  destroy(): void;
}

/**
 * The language model API interface.
 */
export interface AILanguageModel {
  /**
   * Check the availability of the language model.
   * @returns Capabilities including availability status.
   */
  capabilities(): Promise<AILanguageModelCapabilities>;

  /**
   * Create a new language model session.
   * @param options Optional session configuration.
   * @returns A session instance for prompting.
   */
  create(options?: AISessionOptions): Promise<AILanguageModelSession>;
}

/**
 * The Chrome built-in AI API.
 * Accessed via self.ai or globalThis.ai in service worker context.
 */
export interface ChromeAI {
  /**
   * The language model (Prompt API) interface.
   */
  languageModel: AILanguageModel;
}

/**
 * Extend global types to include the Chrome AI API.
 * The AI API is available on:
 * - DedicatedWorkerGlobalScope (service workers, web workers)
 * - Window (in documents with appropriate flags)
 */
declare global {
  // Extend WorkerGlobalScope (covers ServiceWorkerGlobalScope and DedicatedWorkerGlobalScope)
  interface WorkerGlobalScope {
    ai: ChromeAI;
  }

  // Also extend Window for document contexts
  interface Window {
    ai: ChromeAI;
  }
}
