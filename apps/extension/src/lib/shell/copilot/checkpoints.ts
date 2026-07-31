import type { CopilotDeletionReceipt, CopilotJobCheckpoint } from './contracts';
import { CopilotDeletionReceiptSchema, CopilotJobCheckpointSchema } from './validation';

const CHECKPOINT_KEY_PREFIX = 'copilotJobCheckpointV1:';
const DELETION_RECEIPT_KEY_PREFIX = 'copilotDeletionReceiptV1:';

export interface CopilotLocalStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface CopilotCheckpointRepository {
  load(missionId: string): Promise<CopilotJobCheckpoint | null>;
  save(checkpoint: CopilotJobCheckpoint): Promise<void>;
  remove(missionId: string): Promise<void>;
  loadDeletionReceipt(missionId: string): Promise<CopilotDeletionReceipt | null>;
  saveDeletionReceipt(receipt: CopilotDeletionReceipt): Promise<void>;
  removeDeletionReceipt(missionId: string): Promise<void>;
}

function checkpointKey(missionId: string): string {
  return `${CHECKPOINT_KEY_PREFIX}${encodeURIComponent(missionId)}`;
}

function deletionReceiptKey(missionId: string): string {
  return `${DELETION_RECEIPT_KEY_PREFIX}${encodeURIComponent(missionId)}`;
}

export function createCopilotCheckpointRepository(
  storage: CopilotLocalStorageArea = chrome.storage.local
): CopilotCheckpointRepository {
  let mutationChain: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutationChain.then(operation);
    mutationChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  return {
    load(missionId) {
      return serialize(async () => {
        const key = checkpointKey(missionId);
        const result = await storage.get(key);
        const raw = result[key];
        if (raw === undefined) {
          return null;
        }
        const parsed = CopilotJobCheckpointSchema.safeParse(raw);
        if (!parsed.success || parsed.data.missionId !== missionId) {
          await storage.remove(key);
          return null;
        }
        return parsed.data;
      });
    },
    save(checkpoint) {
      return serialize(async () => {
        const parsed = CopilotJobCheckpointSchema.safeParse(checkpoint);
        if (!parsed.success) {
          throw new Error('Invalid Copilot job checkpoint');
        }
        await storage.set({ [checkpointKey(checkpoint.missionId)]: parsed.data });
      });
    },
    remove(missionId) {
      return serialize(() => storage.remove(checkpointKey(missionId)));
    },
    loadDeletionReceipt(missionId) {
      return serialize(async () => {
        const key = deletionReceiptKey(missionId);
        const result = await storage.get(key);
        const parsed = CopilotDeletionReceiptSchema.safeParse(result[key]);
        if (result[key] === undefined) {
          return null;
        }
        if (!parsed.success || parsed.data.missionId !== missionId) {
          await storage.remove(key);
          return null;
        }
        return parsed.data;
      });
    },
    saveDeletionReceipt(receipt) {
      return serialize(async () => {
        const parsed = CopilotDeletionReceiptSchema.safeParse(receipt);
        if (!parsed.success) {
          throw new Error('Invalid Copilot deletion receipt');
        }
        await storage.set({ [deletionReceiptKey(receipt.missionId)]: parsed.data });
      });
    },
    removeDeletionReceipt(missionId) {
      return serialize(() => storage.remove(deletionReceiptKey(missionId)));
    },
  };
}
