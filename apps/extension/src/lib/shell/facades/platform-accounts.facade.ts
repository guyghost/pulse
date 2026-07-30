import type { PlatformAccountBinding } from '@pulse/domain';
import type {
  PlatformAccountConnectorId,
  PlatformAccountOperationResult,
} from '../account/platform-accounts';
import { sendMessage } from '../messaging/bridge';

export async function getPlatformAccounts(): Promise<PlatformAccountBinding[]> {
  const response = await sendMessage({ type: 'GET_PLATFORM_ACCOUNTS' });
  return response.type === 'PLATFORM_ACCOUNTS_RESULT' ? response.payload : [];
}

export async function addPlatformAccount(input: {
  connectorId: PlatformAccountConnectorId;
  displayLabel: string;
  confirmed: boolean;
}): Promise<PlatformAccountOperationResult> {
  const response = await sendMessage({ type: 'ADD_CURRENT_PLATFORM_ACCOUNT', payload: input });
  return response.type === 'PLATFORM_ACCOUNT_ADDED'
    ? response.payload
    : { ok: false, error: 'SERVER_ERROR', state: 'failed_terminal' };
}

export async function switchPlatformAccount(
  bindingId: string
): Promise<PlatformAccountOperationResult> {
  const response = await sendMessage({
    type: 'SWITCH_CURRENT_PLATFORM_ACCOUNT',
    payload: { bindingId },
  });
  return response.type === 'PLATFORM_ACCOUNT_SWITCHED'
    ? response.payload
    : { ok: false, error: 'SERVER_ERROR', state: 'failed_terminal' };
}
