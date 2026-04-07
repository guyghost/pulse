/**
 * Chrome Extensions - Type augmentations for newer Chrome APIs
 * that are not yet typed in @types/chrome
 */

declare namespace chrome.action {
  /**
   * UserSettingsChange - Fired when the extension's action button
   * is added to or removed from the toolbar.
   *
   * Available since Chrome 130+
   */
  interface UserSettingsChange {
    /** Whether the extension's action button is on the toolbar */
    isOnToolbar: boolean;
  }

  /**
   * Fired when the extension's action button is pinned to or unpinned
   * from the browser toolbar.
   *
   * @since Chrome 130
   */
  const onUserSettingsChanged: chrome.events.Event<
    (change: UserSettingsChange) => void
  >;
}
