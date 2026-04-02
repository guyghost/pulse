/**
 * Chrome Storage — single entry point for settings persistence.
 *
 * UI pages import this instead of individual storage modules.
 */

export { getSettings, setSettings } from '../storage/chrome-storage';
