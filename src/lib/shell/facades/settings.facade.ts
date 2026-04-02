/**
 * Settings Facade — Single entry point for settings and profile operations.
 *
 * UI pages import this instead of individual storage modules.
 */
export { getSettings, setSettings } from '../storage/chrome-storage';
export { getProfile, saveProfile } from '../storage/db';
