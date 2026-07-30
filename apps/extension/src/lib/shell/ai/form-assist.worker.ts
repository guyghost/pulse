import type { CapturedFormField } from '@pulse/domain';
import type { UserProfile } from '../../core/types/profile';
import {
  generateFormFieldSuggestionsInWorker,
  type FormSuggestionWorkerResult,
} from './form-assist-worker-core';

export interface FormSuggestionWorkerRequest {
  requestId: string;
  fields: CapturedFormField[];
  profile: UserProfile;
}

export interface FormSuggestionWorkerResponse {
  requestId: string;
  result: FormSuggestionWorkerResult;
}

self.addEventListener('message', (event: MessageEvent<FormSuggestionWorkerRequest>) => {
  const request = event.data;
  void generateFormFieldSuggestionsInWorker(request.fields, request.profile).then((result) => {
    self.postMessage({
      requestId: request.requestId,
      result,
    } satisfies FormSuggestionWorkerResponse);
  });
});
