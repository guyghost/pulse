/**
 * Shell utilities exports
 *
 * This module exposes Shell-side utilities (I/O, side effects).
 */

export {
  RateLimiter,
  globalRateLimiter,
  DEFAULT_PAGE_DELAY_MS,
  delayBetweenPages,
  type RateLimitConfig,
} from './rate-limiter';

export { useDebounce, useDebouncedState, useDebouncedSearch } from './debounce-svelte.svelte';

export {
  registerShortcut,
  registerShortcuts,
  getRegisteredShortcuts,
  formatShortcut,
  clearAllShortcuts,
  isShortcutRegistered,
  FeedShortcuts,
  ShortcutCategories,
  type ShortcutConfig,
} from './keyboard-shortcuts';
