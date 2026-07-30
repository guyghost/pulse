import { sendMessage } from '../messaging/bridge';
import type {
  ExtensionAccountProjection,
  StartAccountLinkResult,
} from '../account/account-connection';

/**
 * Facade for the connected Pulse account. The side panel never receives the
 * device secret and cannot mutate Premium state directly.
 */

export const getPremium = async (): Promise<boolean> => {
  const response = await sendMessage({ type: 'GET_PREMIUM_STATUS' });
  return response?.type === 'PREMIUM_STATUS_RESULT' ? response.payload : false;
};

export const getExtensionAccount = async (): Promise<ExtensionAccountProjection> => {
  const response = await sendMessage({ type: 'GET_EXTENSION_ACCOUNT' });
  if (response?.type !== 'EXTENSION_ACCOUNT_RESULT') {
    throw new Error('Extension account read failed.');
  }
  return response.payload;
};

export const startExtensionAccountLink = async (): Promise<StartAccountLinkResult> => {
  const response = await sendMessage({ type: 'START_EXTENSION_ACCOUNT_LINK' });
  if (response?.type !== 'EXTENSION_ACCOUNT_LINK_STARTED') {
    throw new Error('Extension account link failed.');
  }
  return response.payload;
};

export const pollExtensionAccountLink = async (): Promise<ExtensionAccountProjection> => {
  const response = await sendMessage({ type: 'POLL_EXTENSION_ACCOUNT_LINK' });
  if (response?.type !== 'EXTENSION_ACCOUNT_LINK_STATUS') {
    throw new Error('Extension account link status failed.');
  }
  return response.payload;
};

export const refreshExtensionEntitlement = async (): Promise<ExtensionAccountProjection> => {
  const response = await sendMessage({ type: 'REFRESH_EXTENSION_ENTITLEMENT' });
  if (response?.type !== 'EXTENSION_ENTITLEMENT_REFRESHED') {
    throw new Error('Extension entitlement refresh failed.');
  }
  return response.payload;
};

export const unlinkExtensionAccount = async (): Promise<ExtensionAccountProjection> => {
  const response = await sendMessage({ type: 'UNLINK_EXTENSION_ACCOUNT' });
  if (response?.type !== 'EXTENSION_ACCOUNT_UNLINKED') {
    throw new Error('Extension account unlink failed.');
  }
  return response.payload;
};
