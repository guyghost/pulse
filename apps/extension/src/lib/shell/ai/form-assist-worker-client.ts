import type { CapturedFormField } from '@pulse/domain';
import type { UserProfile } from '../../core/types/profile';
import type { FormSuggestionWorkerResult } from './form-assist-worker-core';
import type {
  FormSuggestionWorkerRequest,
  FormSuggestionWorkerResponse,
} from './form-assist.worker';

const WORKER_TIMEOUT_MS = 45_000;

export async function generateFormFieldSuggestions(
  fields: readonly CapturedFormField[],
  profile: UserProfile
): Promise<FormSuggestionWorkerResult> {
  if (typeof Worker === 'undefined') {
    return { ok: false, error: 'AI_UNAVAILABLE' };
  }

  const worker = new Worker(new URL('./form-assist.worker.ts', import.meta.url), {
    type: 'module',
    name: 'missionpulse-form-assist-ai',
  });
  const requestId = crypto.randomUUID();
  const request: FormSuggestionWorkerRequest = {
    requestId,
    fields: [...fields],
    profile,
  };

  return new Promise<FormSuggestionWorkerResult>((resolve) => {
    let completed = false;
    const finish = (result: FormSuggestionWorkerResult) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };
    const timeout = setTimeout(() => finish({ ok: false, error: 'AI_FAILED' }), WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<FormSuggestionWorkerResponse>) => {
      if (event.data.requestId === requestId) {
        finish(event.data.result);
      }
    };
    worker.onerror = () => finish({ ok: false, error: 'AI_FAILED' });
    worker.postMessage(request);
  });
}
