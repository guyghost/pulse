import type { CopilotSessionCredential } from './contracts';
import { CopilotSessionCredentialSchema } from './validation';

const COPILOT_SESSION_KEY = 'copilotSessionCredentialV1';

export interface CopilotSessionStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface CopilotSessionRepository {
  load(): Promise<CopilotSessionCredential | null>;
  save(credential: CopilotSessionCredential): Promise<void>;
  clear(): Promise<void>;
}

export function createCopilotSessionRepository(
  storage: CopilotSessionStorageArea = chrome.storage.session
): CopilotSessionRepository {
  return {
    async load() {
      const result = await storage.get(COPILOT_SESSION_KEY);
      const raw = result[COPILOT_SESSION_KEY];
      if (raw === undefined) {
        return null;
      }
      const parsed = CopilotSessionCredentialSchema.safeParse(raw);
      if (!parsed.success) {
        await storage.remove(COPILOT_SESSION_KEY);
        return null;
      }
      return parsed.data;
    },
    async save(credential) {
      const parsed = CopilotSessionCredentialSchema.safeParse(credential);
      if (!parsed.success) {
        throw new Error('Invalid Copilot session credential');
      }
      await storage.set({ [COPILOT_SESSION_KEY]: parsed.data });
    },
    async clear() {
      await storage.remove(COPILOT_SESSION_KEY);
    },
  };
}
