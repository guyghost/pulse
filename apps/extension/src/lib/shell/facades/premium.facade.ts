import { sendMessage } from '../messaging/bridge';

/**
 * Facade for reading/writing premium status through the bridge.
 * The service worker handles actual chrome.storage.local I/O.
 */

export const getPremium = async (): Promise<boolean> => {
  const response = await sendMessage({ type: 'GET_PREMIUM_STATUS' });
  return response?.type === 'PREMIUM_STATUS_RESULT' ? response.payload : false;
};

export const savePremium = async (enabled: boolean): Promise<void> => {
  const response = await sendMessage({ type: 'SET_PREMIUM', payload: enabled });
  if (response?.type !== 'PREMIUM_SET' || !response.payload.saved) {
    throw new Error('Premium status save failed.');
  }
};
