/**
 * Settings Facade — Single entry point for settings, profile, and API key operations.
 *
 * UI pages import this instead of individual storage modules.
 */
export {
  getSettings,
  setSettings,
  getApiKey,
  setApiKey,
  removeApiKey,
} from '../storage/chrome-storage';
export { getProfile, saveProfile } from '../storage/db';
