import {
  decideModalTab,
  isDialogTargetEligible,
  isDocumentRecoveryTargetEligible,
  isRecoveryTriggerEligible,
  parseOwnerScopePath,
  selectInitialFocusTarget,
  variantBelongsToSurface,
  type InitialFocusFacts,
  type InitialFocusTarget,
  type ModalCloseReason,
  type ModalFocusVariant,
  type ModalSurface,
} from '$lib/core/modal-focus/focus-policy';

export type { ModalCloseReason, ModalFocusVariant, ModalSurface };

export type ModalRejectionReason =
  | 'INVALID_CONFIG'
  | 'INVALID_SCOPE'
  | 'INVALID_STACKING_CONTEXT'
  | 'CAPACITY_EXHAUSTED'
  | 'SCOPE_TEARDOWN_PENDING'
  | 'DUPLICATE_ROOT'
  | 'DUPLICATE_DIALOG'
  | 'INVALID_UPDATE';

export interface ModalFocusOptions {
  surface: ModalSurface;
  variant: ModalFocusVariant;
  ownerScopePath: readonly string[];
  busy?: boolean;
  onBeforeClose: (reason: ModalCloseReason) => unknown;
  onRejected: (reason: ModalRejectionReason) => void;
}

export interface ModalHandle {
  readonly ordinal: number;
}

export interface ModalRegistry {
  readonly document: Document;
  readonly overlayRoot: HTMLElement;
  readonly documentFallback: HTMLElement;
}

interface PrivateHandle extends ModalHandle {
  readonly registryToken: object;
}

interface ModalEntry {
  handle: PrivateHandle;
  root: HTMLElement;
  dialog: HTMLElement;
  trigger: HTMLElement | null;
  surface: ModalSurface;
  variant: ModalFocusVariant;
  ownerScopePath: readonly string[];
  callbacks: Pick<ModalFocusOptions, 'onBeforeClose' | 'onRejected'>;
  state: 'opening' | 'open' | 'busy' | 'busy-success-pending' | 'closing' | 'disposed';
  domReady: boolean;
  closeCycle: number;
  pendingClose: { cycle: number; reason: ModalCloseReason } | null;
  acceptedClose: { cycle: number; reason: ModalCloseReason } | null;
  pendingRemoval: boolean;
  rejectionNotified: boolean;
  busyOperation: object | null;
}

interface RegistryInternal extends ModalRegistry {
  token: object;
  nextOrdinal: number;
  entries: ModalEntry[];
  commandQueue: Array<() => void>;
  dispatching: boolean;
  pendingRemoval: Set<PrivateHandle>;
  teardownPaths: readonly string[][];
  removalScheduled: boolean;
  keyboardInstalled: boolean;
  keyboardListener: (event: KeyboardEvent) => void;
}

const MAX_LIVE_MODALS = 16;
export const MODAL_LAYER_BASE = 100;
const MODAL_APPLICATION_Z_INDEX = '2147483000';
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]',
].join(',');

let registries = new WeakMap<Document, RegistryInternal>();
const entryByNode = new WeakMap<HTMLElement, { registry: RegistryInternal; entry: ModalEntry }>();

function reportAsync(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function beginsWithPath(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function safeReject(
  callback: ((reason: ModalRejectionReason) => void) | undefined,
  reason: ModalRejectionReason
): void {
  try {
    callback?.(reason);
  } catch (error) {
    reportAsync(error);
  }
}

function projectRejectedRoot(root: HTMLElement): void {
  root.inert = true;
  root.tabIndex = -1;
  root.setAttribute('aria-hidden', 'true');
}

function nodesOverlap(left: Node, right: Node): boolean {
  return left === right || left.contains(right) || right.contains(left);
}

function candidateRootIsDisjoint(registry: RegistryInternal, root: HTMLElement): boolean {
  return registry.entries.every(
    (entry) => !nodesOverlap(root, entry.root) && !nodesOverlap(root, entry.dialog)
  );
}

function configureOverlay(overlay: HTMLElement): void {
  overlay.setAttribute('data-modal-surface-root', '');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.isolation = 'isolate';
  overlay.style.zIndex = MODAL_APPLICATION_Z_INDEX;
  overlay.style.pointerEvents = 'none';
}

function overlayContract(document: Document, overlay: HTMLElement): boolean {
  if (
    overlay.ownerDocument !== document ||
    overlay.parentElement !== document.body ||
    !overlay.hasAttribute('data-modal-surface-root')
  ) {
    return false;
  }
  const style = document.defaultView?.getComputedStyle(document.body);
  return !(
    (style?.transform && style.transform !== 'none') ||
    (style?.filter && style.filter !== 'none') ||
    (style?.perspective && style.perspective !== 'none') ||
    (style?.opacity && Number(style.opacity) < 1) ||
    style?.contain?.includes('paint')
  );
}

function fallbackContract(document: Document, fallback: HTMLElement): boolean {
  return isDocumentRecoveryTargetEligible(fallback, document);
}

export function createModalRegistry(
  document: Document,
  overlayRoot: HTMLElement,
  documentFallback: HTMLElement
): ModalRegistry {
  if (
    registries.has(document) ||
    !overlayContract(document, overlayRoot) ||
    !fallbackContract(document, documentFallback)
  ) {
    throw new Error('INVALID_MODAL_REGISTRY_CONSTRUCTION');
  }
  configureOverlay(overlayRoot);
  const registry: RegistryInternal = {
    document,
    overlayRoot,
    documentFallback,
    token: {},
    nextOrdinal: 0,
    entries: [],
    commandQueue: [],
    dispatching: false,
    pendingRemoval: new Set(),
    teardownPaths: [],
    removalScheduled: false,
    keyboardInstalled: false,
    keyboardListener: () => {},
  };
  registry.keyboardListener = (event) => handleKeydown(registry, event);
  registries.set(document, registry);
  return registry;
}

function createAutomaticRegistry(document: Document): RegistryInternal {
  const overlay = document.createElement('div');
  configureOverlay(overlay);
  const fallback = document.createElement('span');
  fallback.setAttribute('data-modal-document-fallback', '');
  fallback.tabIndex = -1;
  fallback.style.position = 'fixed';
  fallback.style.width = '1px';
  fallback.style.height = '1px';
  fallback.style.opacity = '0';
  fallback.style.pointerEvents = 'none';
  document.body.append(fallback, overlay);
  createModalRegistry(document, overlay, fallback);
  return registries.get(document) as RegistryInternal;
}

function pruneDisconnected(registry: RegistryInternal): void {
  const disconnected = registry.entries.filter(
    (entry) => !entry.root.isConnected || !entry.dialog.isConnected
  );
  if (disconnected.length === 0) {
    return;
  }
  for (const entry of disconnected) {
    freezeRemoval(registry, entry);
  }
}

function registryFor(document: Document): RegistryInternal {
  const current = registries.get(document);
  if (current) {
    if (!current.overlayRoot.isConnected) {
      for (const entry of current.entries) {
        entry.state = 'disposed';
        entryByNode.delete(entry.root);
        entryByNode.delete(entry.dialog);
      }
      current.entries = [];
      if (current.keyboardInstalled) {
        current.document.removeEventListener('keydown', current.keyboardListener, true);
        current.keyboardInstalled = false;
      }
      registries.delete(document);
      return createAutomaticRegistry(document);
    }
    pruneDisconnected(current);
    if (current.overlayRoot.isConnected) {
      return current;
    }
  }
  return createAutomaticRegistry(document);
}

function enqueue(registry: RegistryInternal, command: () => void): void {
  registry.commandQueue.push(command);
  if (registry.dispatching) {
    return;
  }
  registry.dispatching = true;
  try {
    while (registry.commandQueue.length > 0) {
      registry.commandQueue.shift()?.();
    }
  } finally {
    registry.dispatching = false;
  }
}

function liveTopmost(registry: RegistryInternal): ModalEntry | null {
  return registry.entries.at(-1) ?? null;
}

function setEntryProjection(entry: ModalEntry, interactive: boolean, stackIndex: number): void {
  entry.root.style.position = 'absolute';
  entry.root.style.inset = '0';
  entry.root.style.zIndex = String(MODAL_LAYER_BASE + stackIndex);
  entry.root.style.pointerEvents = interactive ? 'auto' : 'none';
  entry.root.inert = !interactive;
  entry.root.tabIndex = -1;
  entry.root.setAttribute('aria-hidden', interactive ? 'false' : 'true');
  entry.dialog.inert = !interactive;
  entry.dialog.setAttribute('aria-hidden', interactive ? 'false' : 'true');
  entry.dialog.setAttribute('aria-modal', interactive ? 'true' : 'false');
}

function project(registry: RegistryInternal): void {
  const topmost = liveTopmost(registry);
  registry.entries.forEach((entry, index) => {
    const interactive =
      entry === topmost && entry.domReady && !entry.pendingRemoval && entry.state !== 'disposed';
    setEntryProjection(entry, interactive, index);
  });
}

function installKeyboard(registry: RegistryInternal): void {
  if (registry.keyboardInstalled || registry.entries.length === 0) {
    return;
  }
  registry.document.addEventListener('keydown', registry.keyboardListener, true);
  registry.keyboardInstalled = true;
}

function removeKeyboard(registry: RegistryInternal): void {
  if (!registry.keyboardInstalled || registry.entries.length > 0) {
    return;
  }
  registry.document.removeEventListener('keydown', registry.keyboardListener, true);
  registry.keyboardInstalled = false;
}

function rootCreatesExtraStackingContext(root: HTMLElement): boolean {
  const style = root.ownerDocument.defaultView?.getComputedStyle(root);
  if (!style) {
    return true;
  }
  return Boolean(
    (style.transform && style.transform !== 'none') ||
    (style.filter && style.filter !== 'none') ||
    (style.perspective && style.perspective !== 'none') ||
    (style.opacity && Number(style.opacity) < 1) ||
    (style.mixBlendMode && style.mixBlendMode !== 'normal') ||
    (style.isolation && style.isolation !== 'auto') ||
    style.contain?.includes('paint') ||
    (style.willChange && style.willChange !== 'auto')
  );
}

function firstEligible(
  dialog: HTMLElement,
  selector: string,
  requireTabStop = false
): HTMLElement | null {
  return (
    [...dialog.querySelectorAll<HTMLElement>(selector)].find((node) =>
      isDialogTargetEligible(node, dialog, requireTabStop)
    ) ?? null
  );
}

function captureInitial(entry: ModalEntry): {
  facts: InitialFocusFacts;
  targets: Record<InitialFocusTarget, HTMLElement>;
} {
  const dialog = entry.dialog;
  const confirmationInput = firstEligible(
    dialog,
    '[data-modal-confirmation-input], #backup-restore-confirm'
  );
  const closeButton = firstEligible(dialog, '[data-modal-close], [data-modal-initial-focus]');
  const cancelButton = firstEligible(dialog, '[data-modal-cancel]');
  const firstEnabledButton = firstEligible(dialog, 'button:not(:disabled)');
  const firstMissionLink = firstEligible(dialog, '[data-modal-mission-link], a[href]');
  const firstEnabledAction = firstEligible(
    dialog,
    '[data-modal-action]:not(:disabled), button:not(:disabled), a[href]'
  );
  const acknowledgementButton = firstEligible(dialog, '[data-modal-acknowledgement]');
  return {
    facts: {
      confirmationInputAvailable: confirmationInput !== null,
      closeButtonAvailable: closeButton !== null,
      cancelButtonAvailable: cancelButton !== null,
      firstEnabledButtonAvailable: firstEnabledButton !== null,
      firstMissionLinkAvailable: firstMissionLink !== null,
      firstEnabledActionAvailable: firstEnabledAction !== null,
      acknowledgementButtonAvailable: acknowledgementButton !== null,
    },
    targets: {
      'confirmation-input': confirmationInput ?? dialog,
      'close-button': closeButton ?? dialog,
      'cancel-button': cancelButton ?? dialog,
      'first-enabled-button': firstEnabledButton ?? dialog,
      'first-mission-link': firstMissionLink ?? dialog,
      'first-enabled-action': firstEnabledAction ?? dialog,
      'acknowledgement-button': acknowledgementButton ?? dialog,
      dialog,
    },
  };
}

function focusElement(target: HTMLElement): boolean {
  try {
    target.focus({ preventScroll: true });
    return target.ownerDocument.activeElement === target;
  } catch {
    return false;
  }
}

function focusInitial(entry: ModalEntry): boolean {
  if (!entry.domReady || entry.pendingRemoval || !entry.dialog.isConnected) {
    return false;
  }
  const capture = captureInitial(entry);
  const choice = selectInitialFocusTarget(entry.variant, capture.facts);
  return focusElement(capture.targets[choice]) || focusElement(entry.dialog);
}

function focusDocumentFallback(registry: RegistryInternal): void {
  if (
    isDocumentRecoveryTargetEligible(registry.documentFallback, registry.document) &&
    focusElement(registry.documentFallback)
  ) {
    return;
  }
  const body = registry.document.body;
  const prior = body.getAttribute('tabindex');
  body.tabIndex = -1;
  focusElement(body);
  if (prior === null) {
    body.removeAttribute('tabindex');
  } else {
    body.setAttribute('tabindex', prior);
  }
}

function handleKeydown(registry: RegistryInternal, event: KeyboardEvent): void {
  enqueue(registry, () => {
    const topmost = liveTopmost(registry);
    if (!topmost) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!topmost.pendingRemoval) {
        beginClose(registry, topmost, 'escape');
      }
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    if (topmost.pendingRemoval || !topmost.domReady) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const focusables = [...topmost.dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      (node) => isDialogTargetEligible(node, topmost.dialog, true)
    );
    const activeIndex = focusables.findIndex((node) => node === registry.document.activeElement);
    const decision = decideModalTab({
      focusableCount: focusables.length,
      activeIndex,
      activeInsideDialog:
        registry.document.activeElement instanceof Node &&
        topmost.dialog.contains(registry.document.activeElement),
      shiftKey: event.shiftKey,
    });
    if (!decision.preventDefault) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target =
      decision.targetIndex === null ? topmost.dialog : focusables[decision.targetIndex];
    focusElement(target ?? topmost.dialog);
  });
}

function beginClose(registry: RegistryInternal, entry: ModalEntry, reason: ModalCloseReason): void {
  if (
    entry.pendingRemoval ||
    entry.state === 'disposed' ||
    entry.state === 'closing' ||
    entry.state === 'busy'
  ) {
    return;
  }
  const cycle = entry.closeCycle + 1;
  entry.closeCycle = cycle;
  entry.pendingClose = { cycle, reason };
  entry.state = 'closing';
  project(registry);
  let disposition: 'accepted' | 'rejected' | 'threw' = 'rejected';
  try {
    const result = entry.callbacks.onBeforeClose(reason);
    disposition = result === 'accepted' ? 'accepted' : 'rejected';
  } catch {
    disposition = 'threw';
  }
  if (entry.pendingClose?.cycle === cycle) {
    entry.pendingClose = null;
    if (disposition === 'accepted') {
      entry.acceptedClose = { cycle, reason };
    } else {
      entry.acceptedClose = null;
      entry.state = entry.domReady ? 'open' : 'opening';
    }
    project(registry);
  }
}

function scheduleFlush(registry: RegistryInternal): void {
  if (registry.removalScheduled) {
    return;
  }
  registry.removalScheduled = true;
  queueMicrotask(() => {
    enqueue(registry, () => flushRemovals(registry));
  });
}

function freezeRemoval(registry: RegistryInternal, entry: ModalEntry): void {
  if (entry.pendingRemoval || entry.state === 'disposed') {
    return;
  }
  entry.pendingRemoval = true;
  registry.pendingRemoval.add(entry.handle);
  project(registry);
  scheduleFlush(registry);
}

function flushRemovals(registry: RegistryInternal): void {
  registry.removalScheduled = false;
  const frozen = new Set(registry.pendingRemoval);
  registry.pendingRemoval.clear();
  if (frozen.size === 0) {
    registry.teardownPaths = [];
    return;
  }
  const previousTop = liveTopmost(registry);
  const removedTop = previousTop && frozen.has(previousTop.handle) ? previousTop : null;
  const previousActive = registry.document.activeElement;
  const removedEntries = registry.entries.filter((entry) => frozen.has(entry.handle));
  for (const entry of removedEntries) {
    setEntryProjection(entry, false, Math.max(0, registry.entries.indexOf(entry)));
    entry.state = 'disposed';
    entryByNode.delete(entry.root);
    entryByNode.delete(entry.dialog);
  }
  registry.entries = registry.entries.filter((entry) => !frozen.has(entry.handle));
  for (const entry of removedEntries) {
    entry.root.remove();
  }
  project(registry);
  const exposed = liveTopmost(registry);
  const topChanged = removedTop !== null;
  if (topChanged) {
    const trigger = removedTop?.acceptedClose ? removedTop.trigger : null;
    if (
      isRecoveryTriggerEligible(trigger, registry.document, exposed?.dialog ?? null) &&
      trigger &&
      focusElement(trigger)
    ) {
      // Causal accepted-close trigger wins.
    } else if (exposed && focusInitial(exposed)) {
      // Current surviving initial policy wins next.
    } else if (exposed && focusElement(exposed.dialog)) {
      // Dialog container fallback.
    } else {
      focusDocumentFallback(registry);
    }
  } else if (previousActive instanceof HTMLElement && previousActive.isConnected) {
    // Background-only removal must not move focus.
  }
  if (exposed?.state === 'busy-success-pending') {
    exposed.state = 'open';
    exposed.busyOperation = null;
    beginClose(registry, exposed, 'business_success');
  }
  registry.teardownPaths = [];
  removeKeyboard(registry);
}

function notifyEntryRejection(entry: ModalEntry, reason: ModalRejectionReason): void {
  if (entry.rejectionNotified) {
    return;
  }
  entry.rejectionNotified = true;
  safeReject(entry.callbacks.onRejected, reason);
}

function rejectRegistration(
  root: HTMLElement,
  dialog: HTMLElement | null,
  options: ModalFocusOptions,
  reason: ModalRejectionReason,
  mutateRoot: boolean
) {
  if (mutateRoot) {
    projectRejectedRoot(root);
  }
  safeReject(options.onRejected, reason);
  return {};
}

function register(
  registry: RegistryInternal,
  root: HTMLElement,
  dialog: HTMLElement,
  options: ModalFocusOptions,
  trigger: HTMLElement | null
): ModalEntry | null {
  const scope = parseOwnerScopePath(options.ownerScopePath);
  if (
    !scope ||
    !variantBelongsToSurface(options.surface, options.variant) ||
    typeof options.onBeforeClose !== 'function' ||
    typeof options.onRejected !== 'function'
  ) {
    rejectRegistration(root, dialog, options, scope ? 'INVALID_CONFIG' : 'INVALID_SCOPE', true);
    return null;
  }
  const duplicateRoot = registry.entries.find((entry) => entry.root === root);
  if (duplicateRoot) {
    rejectRegistration(root, dialog, options, 'DUPLICATE_ROOT', false);
    return null;
  }
  const duplicateDialog = registry.entries.find((entry) => entry.dialog === dialog);
  if (duplicateDialog) {
    rejectRegistration(
      root,
      dialog,
      options,
      'DUPLICATE_DIALOG',
      candidateRootIsDisjoint(registry, root)
    );
    return null;
  }
  if (registry.teardownPaths.some((path) => beginsWithPath(scope, path))) {
    rejectRegistration(root, dialog, options, 'SCOPE_TEARDOWN_PENDING', true);
    return null;
  }
  if (
    root.ownerDocument !== registry.document ||
    root.parentElement !== registry.overlayRoot ||
    dialog.ownerDocument !== registry.document ||
    !root.contains(dialog) ||
    root === dialog ||
    rootCreatesExtraStackingContext(root)
  ) {
    rejectRegistration(root, dialog, options, 'INVALID_STACKING_CONTEXT', true);
    return null;
  }
  if (registry.entries.length >= MAX_LIVE_MODALS) {
    rejectRegistration(root, dialog, options, 'CAPACITY_EXHAUSTED', true);
    return null;
  }
  registry.nextOrdinal += 1;
  const entry: ModalEntry = {
    handle: { ordinal: registry.nextOrdinal, registryToken: registry.token },
    root,
    dialog,
    trigger,
    surface: options.surface,
    variant: options.variant,
    ownerScopePath: scope,
    callbacks: {
      onBeforeClose: options.onBeforeClose,
      onRejected: options.onRejected,
    },
    state: options.busy && options.surface === 'backup_restore' ? 'busy' : 'opening',
    domReady: false,
    closeCycle: 0,
    pendingClose: null,
    acceptedClose: null,
    pendingRemoval: false,
    rejectionNotified: false,
    busyOperation: options.busy ? {} : null,
  };
  registry.entries.push(entry);
  entryByNode.set(root, { registry, entry });
  entryByNode.set(dialog, { registry, entry });
  installKeyboard(registry);
  project(registry);
  return entry;
}

function markDomReady(registry: RegistryInternal, entry: ModalEntry): void {
  enqueue(registry, () => {
    if (entry.state === 'disposed' || entry.domReady || !entry.dialog.isConnected) {
      return;
    }
    entry.domReady = true;
    if (entry.state === 'opening') {
      entry.state = 'open';
    }
    project(registry);
    if (liveTopmost(registry) === entry && !entry.pendingRemoval) {
      focusInitial(entry);
    }
  });
}

function updateEntry(
  registry: RegistryInternal,
  entry: ModalEntry,
  options: ModalFocusOptions
): void {
  enqueue(registry, () => {
    if (entry.state === 'disposed' || entry.pendingRemoval) {
      return;
    }
    const scope = parseOwnerScopePath(options.ownerScopePath);
    const valid =
      scope !== null &&
      samePath(scope, entry.ownerScopePath) &&
      options.surface === entry.surface &&
      variantBelongsToSurface(options.surface, options.variant) &&
      typeof options.onBeforeClose === 'function' &&
      typeof options.onRejected === 'function' &&
      entry.root.parentElement === registry.overlayRoot &&
      entry.root.contains(entry.dialog) &&
      !rootCreatesExtraStackingContext(entry.root);
    if (!valid) {
      notifyEntryRejection(entry, 'INVALID_UPDATE');
      freezeRemoval(registry, entry);
      return;
    }
    entry.variant = options.variant;
    entry.callbacks = {
      onBeforeClose: options.onBeforeClose,
      onRejected: options.onRejected,
    };
    if (entry.surface === 'backup_restore' && options.busy && entry.state === 'open') {
      entry.state = 'busy';
      entry.busyOperation = {};
    } else if (entry.surface === 'backup_restore' && !options.busy && entry.state === 'busy') {
      entry.state = 'open';
      entry.busyOperation = null;
    }
    project(registry);
  });
}

export function modalFocus(root: HTMLElement, initialOptions: ModalFocusOptions) {
  const document = root.ownerDocument;
  const registry = registryFor(document);
  const dialog =
    (root.matches('[role="dialog"]') ? root : root.querySelector<HTMLElement>('[role="dialog"]')) ??
    null;
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!dialog) {
    return rejectRegistration(
      root,
      null,
      initialOptions,
      'INVALID_CONFIG',
      candidateRootIsDisjoint(registry, root)
    );
  }
  const duplicateRoot = registry.entries.some((entry) => entry.root === root);
  const duplicateDialog = registry.entries.some((entry) => entry.dialog === dialog);
  const disjointRoot = candidateRootIsDisjoint(registry, root);
  if (duplicateRoot || duplicateDialog || !disjointRoot) {
    return rejectRegistration(
      root,
      dialog,
      initialOptions,
      duplicateRoot
        ? 'DUPLICATE_ROOT'
        : duplicateDialog
          ? 'DUPLICATE_DIALOG'
          : 'INVALID_STACKING_CONTEXT',
      duplicateDialog && disjointRoot
    );
  }
  registry.overlayRoot.appendChild(root);
  let entry: ModalEntry | null = null;
  enqueue(registry, () => {
    entry = register(registry, root, dialog, initialOptions, trigger);
  });
  if (!entry) {
    return {};
  }
  const accepted = entry;
  queueMicrotask(() => markDomReady(registry, accepted));
  return {
    update(nextOptions: ModalFocusOptions) {
      updateEntry(registry, accepted, nextOptions);
    },
    destroy() {
      enqueue(registry, () => freezeRemoval(registry, accepted));
    },
  };
}

export function requestModalClose(node: HTMLElement | null, reason: ModalCloseReason): boolean {
  if (!node) {
    return false;
  }
  const binding = entryByNode.get(node);
  if (!binding || binding.entry.state === 'disposed') {
    return false;
  }
  enqueue(binding.registry, () => {
    if (reason === 'business_success' && binding.entry.state === 'busy') {
      binding.entry.busyOperation = null;
      if (liveTopmost(binding.registry) !== binding.entry) {
        binding.entry.state = 'busy-success-pending';
        project(binding.registry);
        return;
      }
      binding.entry.state = 'open';
    }
    beginClose(binding.registry, binding.entry, reason);
  });
  return true;
}

export function teardownModalScope(document: Document, ownerScopePath: readonly string[]): void {
  const path = parseOwnerScopePath(ownerScopePath);
  if (!path) {
    return;
  }
  const registry = registryFor(document);
  enqueue(registry, () => {
    if (!registry.teardownPaths.some((candidate) => samePath(candidate, path))) {
      registry.teardownPaths = [...registry.teardownPaths, [...path]];
    }
    const matches = registry.entries.filter(
      (entry) => !entry.pendingRemoval && beginsWithPath(entry.ownerScopePath, path)
    );
    for (const entry of matches) {
      freezeRemoval(registry, entry);
    }
    scheduleFlush(registry);
  });
}

export function prepareModalBusinessClose(node: HTMLElement | null): void {
  if (!node) {
    return;
  }
  const binding = entryByNode.get(node);
  if (!binding) {
    return;
  }
  enqueue(binding.registry, () => {
    if (
      binding.entry.surface === 'backup_restore' &&
      binding.entry.state === 'open' &&
      liveTopmost(binding.registry) === binding.entry
    ) {
      binding.entry.state = 'busy';
      binding.entry.busyOperation = {};
      project(binding.registry);
    }
  });
}

export function clearPreparedModalBusinessClose(node: HTMLElement | null): void {
  if (!node) {
    return;
  }
  const binding = entryByNode.get(node);
  if (!binding) {
    return;
  }
  enqueue(binding.registry, () => {
    if (binding.entry.state === 'busy') {
      binding.entry.state = 'open';
      binding.entry.busyOperation = null;
      project(binding.registry);
    }
  });
}

/** Test-only reset for isolated documents; production code never calls it. */
export function resetModalRegistriesForTests(): void {
  registries = new WeakMap<Document, RegistryInternal>();
}
