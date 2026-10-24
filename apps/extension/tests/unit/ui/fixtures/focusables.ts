/**
 * Tab-stop candidates used by the modal focus trap. Kept in sync with
 * FOCUSABLE_SELECTOR in src/lib/shell/ui/modal-focus.ts, which additionally
 * rejects hidden ancestors and elements without a non-negative tabIndex.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]',
].join(',');

function hiddenThrough(node: HTMLElement, boundary: HTMLElement): boolean {
  let current: HTMLElement | null = node;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      current.hidden ||
      current.inert ||
      current.getAttribute('aria-hidden') === 'true' ||
      style?.display === 'none' ||
      style?.visibility === 'hidden'
    ) {
      return true;
    }
    if (current === boundary) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

/** Tab stops in tree order, matching what the focus trap cycles through. */
export function dialogTabStops(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (node) => node.tabIndex >= 0 && !hiddenThrough(node, dialog)
  );
}
