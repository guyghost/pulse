/** Pure policy and DOM eligibility predicates for the shared modal registry. */

export type ModalSurface =
  'backup_restore' | 'mission_comparison' | 'mission_investigation' | 'keyboard_shortcuts_help';

export type ModalFocusVariant =
  | 'backup_valid'
  | 'backup_error'
  | 'backup_validation_pending'
  | 'comparison'
  | 'investigation'
  | 'shortcuts_help';

export type InitialFocusVariant = ModalFocusVariant;
export type ModalCloseReason = 'explicit' | 'escape' | 'business_success';

export type InitialFocusTarget =
  | 'confirmation-input'
  | 'close-button'
  | 'cancel-button'
  | 'first-enabled-button'
  | 'first-mission-link'
  | 'first-enabled-action'
  | 'acknowledgement-button'
  | 'dialog';

export interface InitialFocusFacts {
  confirmationInputAvailable: boolean;
  closeButtonAvailable: boolean;
  cancelButtonAvailable: boolean;
  firstEnabledButtonAvailable: boolean;
  firstMissionLinkAvailable: boolean;
  firstEnabledActionAvailable: boolean;
  acknowledgementButtonAvailable: boolean;
}

export interface ModalTabFacts {
  focusableCount: number;
  activeIndex: number;
  activeInsideDialog: boolean;
  shiftKey: boolean;
}

export interface ModalTabDecision {
  preventDefault: boolean;
  targetIndex: number | null;
}

const VARIANT_SURFACE: Record<ModalFocusVariant, ModalSurface> = {
  backup_valid: 'backup_restore',
  backup_error: 'backup_restore',
  backup_validation_pending: 'backup_restore',
  comparison: 'mission_comparison',
  investigation: 'mission_investigation',
  shortcuts_help: 'keyboard_shortcuts_help',
};

export function variantBelongsToSurface(
  surface: ModalSurface,
  variant: ModalFocusVariant
): boolean {
  return VARIANT_SURFACE[variant] === surface;
}

export function selectInitialFocusTarget(
  variant: ModalFocusVariant,
  facts: InitialFocusFacts
): InitialFocusTarget {
  switch (variant) {
    case 'backup_valid':
      if (facts.confirmationInputAvailable) {
        return 'confirmation-input';
      }
      if (facts.firstEnabledButtonAvailable) {
        return 'first-enabled-button';
      }
      return 'dialog';
    case 'backup_error':
      return facts.closeButtonAvailable ? 'close-button' : 'dialog';
    case 'backup_validation_pending':
      return facts.cancelButtonAvailable ? 'cancel-button' : 'dialog';
    case 'comparison':
      if (facts.closeButtonAvailable) {
        return 'close-button';
      }
      if (facts.firstMissionLinkAvailable) {
        return 'first-mission-link';
      }
      return 'dialog';
    case 'investigation':
      if (facts.closeButtonAvailable) {
        return 'close-button';
      }
      if (facts.firstEnabledActionAvailable) {
        return 'first-enabled-action';
      }
      return 'dialog';
    case 'shortcuts_help':
      if (facts.closeButtonAvailable) {
        return 'close-button';
      }
      if (facts.acknowledgementButtonAvailable) {
        return 'acknowledgement-button';
      }
      return 'dialog';
  }
}

export function decideModalTab(facts: ModalTabFacts): ModalTabDecision {
  if (facts.focusableCount <= 0) {
    return { preventDefault: true, targetIndex: null };
  }
  if (!facts.activeInsideDialog || facts.activeIndex < 0) {
    return {
      preventDefault: true,
      targetIndex: facts.shiftKey ? facts.focusableCount - 1 : 0,
    };
  }
  if (facts.focusableCount === 1) {
    return { preventDefault: true, targetIndex: 0 };
  }
  if (facts.shiftKey && facts.activeIndex === 0) {
    return { preventDefault: true, targetIndex: facts.focusableCount - 1 };
  }
  if (!facts.shiftKey && facts.activeIndex === facts.focusableCount - 1) {
    return { preventDefault: true, targetIndex: 0 };
  }
  return { preventDefault: false, targetIndex: null };
}

export function parseOwnerScopePath(input: unknown): readonly string[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 16) {
    return null;
  }
  const normalized: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string') {
      return null;
    }
    const segment = value.trim();
    if (
      segment.length === 0 ||
      segment.length > 64 ||
      segment !== segment.normalize('NFC') ||
      segment.includes('/') ||
      /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(segment)
    ) {
      return null;
    }
    normalized.push(segment);
  }
  return Object.freeze(normalized);
}

export const parseCanonicalModalScope = parseOwnerScopePath;

function isDisabled(node: HTMLElement): boolean {
  return 'disabled' in node && Boolean((node as HTMLButtonElement).disabled);
}

function hiddenThrough(node: HTMLElement, boundary: HTMLElement | null): boolean {
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
  return boundary !== null;
}

export function isDialogTargetEligible(
  node: HTMLElement | null,
  dialog: HTMLElement,
  requireTabStop: boolean
): boolean {
  if (
    !node ||
    !node.isConnected ||
    !dialog.isConnected ||
    node.ownerDocument !== dialog.ownerDocument ||
    !dialog.contains(node) ||
    isDisabled(node) ||
    hiddenThrough(node, dialog) ||
    (requireTabStop && node.tabIndex < 0)
  ) {
    return false;
  }
  return true;
}

export function isRecoveryTriggerEligible(
  node: HTMLElement | null,
  document: Document,
  survivingDialog: HTMLElement | null
): boolean {
  if (
    !node ||
    !node.isConnected ||
    node.ownerDocument !== document ||
    isDisabled(node) ||
    hiddenThrough(node, null) ||
    (survivingDialog !== null && !survivingDialog.contains(node))
  ) {
    return false;
  }
  return true;
}

export function isDocumentRecoveryTargetEligible(
  node: HTMLElement | null,
  document: Document
): boolean {
  return Boolean(
    node &&
    node.isConnected &&
    node.ownerDocument === document &&
    !isDisabled(node) &&
    !hiddenThrough(node, null)
  );
}
