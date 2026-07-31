import type {
  FormAssistApplyResult,
  FormAssistDecision,
  FormAssistRequestResult,
} from '../ai/form-assist';
import { sendMessage } from '../messaging/bridge';

export async function requestFormAssist(
  consentApproved: boolean
): Promise<FormAssistRequestResult> {
  const response = await sendMessage({
    type: 'REQUEST_FORM_ASSIST',
    payload: { consentApproved },
  });
  if (response.type !== 'FORM_ASSIST_RESULT') {
    return { ok: false, state: 'failed_terminal', error: 'CAPTURE_FAILED' };
  }
  return response.payload;
}

export async function applyFormAssist(
  sessionId: string,
  decisions: FormAssistDecision[]
): Promise<FormAssistApplyResult> {
  const response = await sendMessage({
    type: 'APPLY_FORM_ASSIST',
    payload: { sessionId, decisions },
  });
  if (response.type !== 'FORM_ASSIST_APPLIED') {
    return { ok: false, state: 'failed_terminal', error: 'APPLY_FAILED' };
  }
  return response.payload;
}
