import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  modalFocus,
  modalFeedback,
  createModalRegistry,
  requestModalClose,
  teardownModalScope,
  type ModalFocusOptions,
  type ModalFocusVariant,
  type ModalSurface,
} from '../../../src/lib/shell/ui/modal-focus';

function createSurface(label: string) {
  const root = document.createElement('div');
  const dialog = document.createElement('div');
  const close = document.createElement('button');
  dialog.setAttribute('role', 'dialog');
  dialog.tabIndex = -1;
  close.textContent = label;
  close.setAttribute('data-modal-initial-focus', '');
  dialog.appendChild(close);
  root.appendChild(dialog);
  document.body.appendChild(root);
  return { root, dialog, close };
}

function options(overrides: Partial<ModalFocusOptions> = {}): ModalFocusOptions {
  return {
    surface: 'mission_comparison',
    variant: 'comparison',
    ownerScopePath: ['feed', 'comparison'],
    onBeforeClose: () => 'accepted',
    onRejected: () => {},
    ...overrides,
  };
}

async function flushRemoval(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

interface SurfaceCase {
  id: string;
  surface: ModalSurface;
  variant: ModalFocusVariant;
}

const SURFACE_CASES: readonly SurfaceCase[] = [
  { id: 'backup', surface: 'backup_restore', variant: 'backup_valid' },
  { id: 'comparison', surface: 'mission_comparison', variant: 'comparison' },
  { id: 'investigation', surface: 'mission_investigation', variant: 'investigation' },
  { id: 'shortcuts', surface: 'keyboard_shortcuts_help', variant: 'shortcuts_help' },
];

const NESTING_ORDERS: Array<[string, SurfaceCase, SurfaceCase]> = [];
for (let firstIndex = 0; firstIndex < SURFACE_CASES.length; firstIndex += 1) {
  for (let secondIndex = firstIndex + 1; secondIndex < SURFACE_CASES.length; secondIndex += 1) {
    const first = SURFACE_CASES[firstIndex];
    const second = SURFACE_CASES[secondIndex];
    NESTING_ORDERS.push(
      [`${first.id} -> ${second.id}`, first, second],
      [`${second.id} -> ${first.id}`, second, first]
    );
  }
}

function surfaceOptions(
  surface: SurfaceCase,
  scope: string,
  onBeforeClose: ModalFocusOptions['onBeforeClose'] = () => 'accepted'
): ModalFocusOptions {
  return options({
    surface: surface.surface,
    variant: surface.variant,
    ownerScopePath: ['modal-matrix', scope],
    onBeforeClose,
  });
}

describe('per-document modal registry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('owns one direct-body overlay and paints roots as deterministic direct siblings', async () => {
    const first = createSurface('Premier');
    const firstBinding = modalFocus(first.root, options());
    const second = createSurface('Second');
    const secondBinding = modalFocus(
      second.root,
      options({
        surface: 'keyboard_shortcuts_help',
        variant: 'shortcuts_help',
        ownerScopePath: ['feed', 'shortcuts'],
      })
    );
    await flushRemoval();

    const overlays = document.body.querySelectorAll(':scope > [data-modal-surface-root]');
    expect(overlays).toHaveLength(1);
    const overlay = overlays[0] as HTMLElement;
    expect(first.root.parentElement).toBe(overlay);
    expect(second.root.parentElement).toBe(overlay);
    expect(Number(second.root.style.zIndex)).toBeGreaterThan(Number(first.root.style.zIndex));
    expect(first.root.inert).toBe(true);
    expect(first.dialog.getAttribute('aria-hidden')).toBe('true');
    expect(first.dialog.getAttribute('aria-modal')).toBe('false');
    expect(second.root.inert).toBe(false);
    expect(second.dialog.getAttribute('aria-hidden')).toBe('false');
    expect(second.dialog.getAttribute('aria-modal')).toBe('true');

    secondBinding.destroy?.();
    firstBinding.destroy?.();
    await flushRemoval();
  });

  it('rejects an overlapping duplicate dialog without mutating any shared DOM', async () => {
    const accepted = createSurface('Acceptée');
    const acceptedBinding = modalFocus(accepted.root, options());
    await flushRemoval();

    const candidateRoot = document.createElement('div');
    candidateRoot.appendChild(accepted.dialog);
    document.body.appendChild(candidateRoot);
    accepted.close.focus();
    const onRejected = vi.fn();
    const baseline = {
      acceptedRootInert: accepted.root.inert,
      acceptedRootAriaHidden: accepted.root.getAttribute('aria-hidden'),
      dialogInert: accepted.dialog.inert,
      dialogAriaHidden: accepted.dialog.getAttribute('aria-hidden'),
      dialogAriaModal: accepted.dialog.getAttribute('aria-modal'),
      activeElement: document.activeElement,
      candidateInert: candidateRoot.inert,
      candidateAriaHidden: candidateRoot.getAttribute('aria-hidden'),
      candidateTabIndex: candidateRoot.getAttribute('tabindex'),
    };

    modalFocus(
      candidateRoot,
      options({
        ownerScopePath: ['feed', 'duplicate-dialog'],
        onRejected,
      })
    );

    expect(onRejected).toHaveBeenCalledOnce();
    expect(onRejected).toHaveBeenCalledWith('DUPLICATE_DIALOG');
    expect(accepted.root.inert).toBe(baseline.acceptedRootInert);
    expect(accepted.root.getAttribute('aria-hidden')).toBe(baseline.acceptedRootAriaHidden);
    expect(accepted.dialog.inert).toBe(baseline.dialogInert);
    expect(accepted.dialog.getAttribute('aria-hidden')).toBe(baseline.dialogAriaHidden);
    expect(accepted.dialog.getAttribute('aria-modal')).toBe(baseline.dialogAriaModal);
    expect(document.activeElement).toBe(baseline.activeElement);
    expect(candidateRoot.inert).toBe(baseline.candidateInert);
    expect(candidateRoot.getAttribute('aria-hidden')).toBe(baseline.candidateAriaHidden);
    expect(candidateRoot.getAttribute('tabindex')).toBe(baseline.candidateTabIndex);
    expect(candidateRoot.parentElement).toBe(document.body);

    acceptedBinding.destroy?.();
    await flushRemoval();
  });

  it('gives Tab and Escape exclusively to the unique topmost entry', async () => {
    const firstClose = vi.fn(() => 'accepted' as const);
    const secondClose = vi.fn(() => 'rejected' as const);
    const first = createSurface('Premier');
    const firstBinding = modalFocus(first.root, options({ onBeforeClose: firstClose }));
    const second = createSurface('Second');
    const secondBinding = modalFocus(
      second.root,
      options({
        surface: 'keyboard_shortcuts_help',
        variant: 'shortcuts_help',
        ownerScopePath: ['feed', 'shortcuts'],
        onBeforeClose: secondClose,
      })
    );
    await flushRemoval();

    first.close.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(second.close);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(firstClose).not.toHaveBeenCalled();

    secondBinding.destroy?.();
    firstBinding.destroy?.();
    await flushRemoval();
  });

  it.each([undefined, null, false, {}, Promise.resolve('accepted')])(
    'rejects every non-literal synchronous close result (%s)',
    async (result) => {
      const surface = createSurface('Fermer');
      const callback = vi.fn(() => result);
      const binding = modalFocus(surface.root, options({ onBeforeClose: callback }));
      await flushRemoval();

      expect(requestModalClose(surface.root, 'explicit')).toBe(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(surface.root.inert).toBe(false);
      expect(surface.dialog.getAttribute('aria-modal')).toBe('true');

      binding.destroy?.();
      await flushRemoval();
    }
  );

  it('freezes a canonical scope immediately and removes the exact prefix as one group', async () => {
    const feedOne = createSurface('Feed 1');
    const feedTen = createSurface('Feed 10');
    const oneBinding = modalFocus(
      feedOne.root,
      options({ ownerScopePath: ['feed', '1', 'comparison'] })
    );
    const tenBinding = modalFocus(
      feedTen.root,
      options({
        surface: 'keyboard_shortcuts_help',
        variant: 'shortcuts_help',
        ownerScopePath: ['feed', '10', 'shortcuts'],
      })
    );
    await flushRemoval();

    teardownModalScope(document, ['feed', '1']);
    expect(feedOne.root.inert).toBe(true);
    expect(feedOne.dialog.getAttribute('aria-hidden')).toBe('true');
    expect(feedTen.dialog.getAttribute('aria-modal')).toBe('true');
    await flushRemoval();

    expect(feedOne.root.isConnected).toBe(false);
    expect(feedTen.root.isConnected).toBe(true);
    tenBinding.destroy?.();
    oneBinding.destroy?.();
    await flushRemoval();
  });

  it('gates an empty teardown scope until its scheduled microtask flush', async () => {
    const survivor = createSurface('Survivante');
    const survivorBinding = modalFocus(
      survivor.root,
      options({ ownerScopePath: ['feed', 'survivor'] })
    );
    await flushRemoval();

    teardownModalScope(document, ['feed', 'empty']);
    const rejected = createSurface('Rejetée');
    const onRejected = vi.fn();
    modalFocus(rejected.root, options({ ownerScopePath: ['feed', 'empty', 'child'], onRejected }));

    expect(onRejected).toHaveBeenCalledOnce();
    expect(onRejected).toHaveBeenCalledWith('SCOPE_TEARDOWN_PENDING');

    await flushRemoval();
    const accepted = createSurface('Acceptée après flush');
    const acceptedRejected = vi.fn();
    const acceptedBinding = modalFocus(
      accepted.root,
      options({ ownerScopePath: ['feed', 'empty', 'child'], onRejected: acceptedRejected })
    );
    await flushRemoval();

    expect(acceptedRejected).not.toHaveBeenCalled();
    expect(accepted.dialog.getAttribute('aria-modal')).toBe('true');

    acceptedBinding.destroy?.();
    survivorBinding.destroy?.();
    await flushRemoval();
  });

  it('installs the document keyboard listener only from first registration to last removal', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const surface = createSurface('Fermer');
    const binding = modalFocus(surface.root, options());
    await flushRemoval();

    expect(add).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    binding.destroy?.();
    await flushRemoval();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true);

    add.mockRestore();
    remove.mockRestore();
  });

  it('accepts 16 live entries, rejects the 17th and reuses capacity after removal', async () => {
    const bindings: ReturnType<typeof modalFocus>[] = [];
    for (let index = 0; index < 16; index += 1) {
      const surface = createSurface(`Modal ${index}`);
      bindings.push(
        modalFocus(surface.root, options({ ownerScopePath: ['feed', `modal-${index}`] }))
      );
    }
    const rejected = createSurface('Modal rejetée');
    const onRejected = vi.fn();
    modalFocus(rejected.root, options({ ownerScopePath: ['feed', 'overflow'], onRejected }));
    await flushRemoval();

    expect(onRejected).toHaveBeenCalledWith('CAPACITY_EXHAUSTED');
    expect(rejected.root.inert).toBe(true);
    expect(requestModalClose(rejected.root, 'explicit')).toBe(false);

    bindings.at(-1)?.destroy?.();
    await flushRemoval();
    const replacement = createSurface('Remplacement');
    const replacementRejected = vi.fn();
    const replacementBinding = modalFocus(
      replacement.root,
      options({ ownerScopePath: ['feed', 'replacement'], onRejected: replacementRejected })
    );
    await flushRemoval();
    expect(replacementRejected).not.toHaveBeenCalled();
    expect(replacement.dialog.getAttribute('aria-modal')).toBe('true');

    replacementBinding.destroy?.();
    for (const binding of bindings) {
      binding.destroy?.();
    }
    await flushRemoval();
  });

  it('terminally removes an entry when a complete update changes its canonical scope', async () => {
    const surface = createSurface('Fermer');
    const originalRejected = vi.fn();
    const replacementRejected = vi.fn();
    const binding = modalFocus(surface.root, options({ onRejected: originalRejected }));
    await flushRemoval();

    binding.update?.(
      options({
        ownerScopePath: ['feed', 'changed'],
        onRejected: replacementRejected,
      })
    );
    expect(surface.root.inert).toBe(true);
    expect(originalRejected).toHaveBeenCalledWith('INVALID_UPDATE');
    expect(replacementRejected).not.toHaveBeenCalled();
    await flushRemoval();
    expect(surface.root.isConnected).toBe(false);
  });

  it('defers a successful background Backup close until that entry is exposed', async () => {
    const backupClose = vi.fn(() => 'rejected' as const);
    const backup = createSurface('Backup');
    const backupBinding = modalFocus(
      backup.root,
      options({
        surface: 'backup_restore',
        variant: 'backup_valid',
        ownerScopePath: ['settings', 'backup'],
        busy: true,
        onBeforeClose: backupClose,
      })
    );
    const foreground = createSurface('Premier plan');
    const foregroundBinding = modalFocus(
      foreground.root,
      options({ ownerScopePath: ['feed', 'foreground'] })
    );
    await flushRemoval();

    expect(requestModalClose(backup.root, 'business_success')).toBe(true);
    expect(backupClose).not.toHaveBeenCalled();
    foregroundBinding.destroy?.();
    await flushRemoval();

    expect(backupClose).toHaveBeenCalledWith('business_success');
    expect(backup.root.inert).toBe(false);
    expect(backup.dialog.getAttribute('aria-modal')).toBe('true');
    backupBinding.destroy?.();
    await flushRemoval();
  });

  it('accepts one neutral feedback staging root and owner-disposes a reentrant duplicate first', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const duplicateRejected = vi.fn();
    let duplicateBinding: ReturnType<typeof modalFeedback> | null = null;

    const binding = modalFeedback(host, {
      onAccepted: () => {
        duplicateBinding = modalFeedback(host, { onRejected: duplicateRejected });
      },
    });

    const renderer = host.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    expect(renderer).not.toBeNull();
    expect(host.hasAttribute('data-modal-feedback-host')).toBe(true);
    expect(renderer?.getAttribute('role')).toBe('status');
    expect(renderer?.getAttribute('aria-live')).toBe('polite');
    expect(document.querySelectorAll('[data-modal-feedback-renderer]')).toHaveLength(1);
    expect(duplicateRejected).toHaveBeenCalledOnce();
    expect(duplicateRejected).toHaveBeenCalledWith('DUPLICATE_FEEDBACK_BINDING');
    expect(host.children).toHaveLength(1);

    duplicateBinding?.destroy();
    binding.destroy();
  });

  it('moves the exact feedback renderer through nested topmost dialogs and back to its host', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const feedback = modalFeedback(host);
    const renderer = host.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    const first = createSurface('Première');
    const firstBinding = modalFocus(first.root, options());
    await flushRemoval();

    expect(first.dialog.contains(renderer)).toBe(true);
    const second = createSurface('Deuxième');
    const secondBinding = modalFocus(
      second.root,
      options({
        surface: 'keyboard_shortcuts_help',
        variant: 'shortcuts_help',
        ownerScopePath: ['feed', 'shortcuts'],
      })
    );
    await flushRemoval();

    expect(second.dialog.contains(renderer)).toBe(true);
    expect(document.querySelectorAll('[data-modal-feedback-renderer]')).toHaveLength(1);
    secondBinding.destroy?.();
    expect(second.dialog.contains(renderer)).toBe(true);
    expect(second.root.inert).toBe(true);
    await flushRemoval();
    expect(first.dialog.contains(renderer)).toBe(true);
    expect(first.dialog.getAttribute('aria-modal')).toBe('true');

    firstBinding.destroy?.();
    await flushRemoval();
    expect(renderer?.parentElement).toBe(host);
    feedback.destroy();
    expect(host.hasAttribute('data-modal-feedback-host')).toBe(false);
    expect(renderer?.isConnected).toBe(false);
  });

  it('binds the first neutral renderer directly into an existing active topmost dialog', async () => {
    const surface = createSurface('Active');
    const modalBinding = modalFocus(
      surface.root,
      options({
        surface: 'mission_investigation',
        variant: 'investigation',
        ownerScopePath: ['feed', 'active'],
      })
    );
    await flushRemoval();
    const host = document.createElement('div');
    document.body.append(host);
    const feedback = modalFeedback(host);
    const renderer = document.querySelector<HTMLElement>('[data-modal-feedback-renderer]');

    expect(surface.dialog.contains(renderer)).toBe(true);
    expect(host.hasAttribute('data-modal-feedback-host')).toBe(true);
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    modalBinding.destroy?.();
    await flushRemoval();
    expect(renderer?.parentElement).toBe(host);
    feedback.destroy();
  });

  it('moves feedback into a disjoint modal registered while the former topmost is removal-frozen', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const feedback = modalFeedback(host);
    const renderer = host.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    const frozen = createSurface('Gelée');
    const frozenBinding = modalFocus(frozen.root, options({ ownerScopePath: ['feed', 'frozen'] }));
    await flushRemoval();

    teardownModalScope(document, ['feed', 'frozen']);
    expect(frozen.root.inert).toBe(true);
    expect(frozen.dialog.contains(renderer)).toBe(true);

    const rejected = createSurface('Même portée');
    const onRejected = vi.fn();
    modalFocus(rejected.root, options({ ownerScopePath: ['feed', 'frozen', 'child'], onRejected }));
    expect(onRejected).toHaveBeenCalledWith('SCOPE_TEARDOWN_PENDING');
    expect(frozen.dialog.contains(renderer)).toBe(true);

    const next = createSurface('Nouvelle');
    const nextBinding = modalFocus(
      next.root,
      options({
        surface: 'mission_investigation',
        variant: 'investigation',
        ownerScopePath: ['feed', 'next'],
      })
    );
    expect(next.dialog.contains(renderer)).toBe(true);
    await flushRemoval();

    expect(frozen.root.isConnected).toBe(false);
    expect(next.dialog.contains(renderer)).toBe(true);
    expect(next.dialog.getAttribute('aria-modal')).toBe('true');
    nextBinding.destroy?.();
    frozenBinding.destroy?.();
    await flushRemoval();
    feedback.destroy();
  });

  it('binds into a sole frozen topmost and returns to the application host on the zero flush', async () => {
    const frozen = createSurface('Seule gelée');
    const frozenBinding = modalFocus(
      frozen.root,
      options({ ownerScopePath: ['feed', 'sole-frozen'] })
    );
    await flushRemoval();
    teardownModalScope(document, ['feed', 'sole-frozen']);

    const host = document.createElement('div');
    document.body.append(host);
    const feedback = modalFeedback(host);
    const renderer = document.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    expect(frozen.root.inert).toBe(true);
    expect(frozen.dialog.contains(renderer)).toBe(true);

    await flushRemoval();
    expect(frozen.root.isConnected).toBe(false);
    expect(renderer?.parentElement).toBe(host);
    frozenBinding.destroy?.();
    feedback.destroy();
  });

  it('rolls back a failed staging placement before notification and accepts a fresh retry', async () => {
    const surface = createSurface('Active');
    const modalBinding = modalFocus(surface.root, options());
    await flushRemoval();
    const host = document.createElement('div');
    document.body.append(host);
    const rejected = vi.fn();
    const append = vi.spyOn(surface.dialog, 'appendChild').mockImplementation(() => {
      throw new Error('placement failed');
    });

    modalFeedback(host, { onRejected: rejected });
    expect(rejected).toHaveBeenCalledWith('FEEDBACK_ACTIVATION_FAILED');
    expect(host.hasAttribute('data-modal-feedback-host')).toBe(false);
    expect(document.querySelector('[data-modal-feedback-renderer]')).toBeNull();
    expect(host.children).toHaveLength(0);

    append.mockRestore();
    const retry = modalFeedback(host);
    expect(surface.dialog.querySelector('[data-modal-feedback-renderer]')).not.toBeNull();
    modalBinding.destroy?.();
    await flushRemoval();
    retry.destroy();
  });

  it('rolls back a throwing activation callback before notifying and permits a fresh retry', () => {
    const queuedMicrotasks: Array<() => void> = [];
    const queue = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      queuedMicrotasks.push(callback);
    });
    const host = document.createElement('div');
    document.body.append(host);
    const rejected = vi.fn();

    try {
      modalFeedback(host, {
        onAccepted: () => {
          throw new Error('activation failed');
        },
        onRejected: rejected,
      });

      expect(rejected).toHaveBeenCalledOnce();
      expect(rejected).toHaveBeenCalledWith('FEEDBACK_ACTIVATION_FAILED');
      expect(host.hasAttribute('data-modal-feedback-host')).toBe(false);
      expect(host.children).toHaveLength(0);
      expect(document.querySelector('[data-modal-feedback-renderer]')).toBeNull();
      expect(queuedMicrotasks).toHaveLength(0);

      const retry = modalFeedback(host);
      expect(host.querySelector('[data-modal-feedback-renderer]')).not.toBeNull();
      retry.destroy();
    } finally {
      queue.mockRestore();
    }
  });

  it('binds directly into an already frozen topmost and flushes to the surviving dialog', async () => {
    const survivor = createSurface('Survivante');
    const survivorBinding = modalFocus(
      survivor.root,
      options({ ownerScopePath: ['feed', 'survivor'] })
    );
    const frozen = createSurface('Gelée');
    const frozenBinding = modalFocus(
      frozen.root,
      options({
        surface: 'keyboard_shortcuts_help',
        variant: 'shortcuts_help',
        ownerScopePath: ['feed', 'frozen'],
      })
    );
    await flushRemoval();
    teardownModalScope(document, ['feed', 'frozen']);

    const host = document.createElement('div');
    document.body.append(host);
    const feedback = modalFeedback(host);
    const renderer = document.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    expect(frozen.root.inert).toBe(true);
    expect(frozen.dialog.contains(renderer)).toBe(true);
    expect(survivor.dialog.getAttribute('aria-modal')).toBe('false');

    await flushRemoval();
    expect(survivor.dialog.contains(renderer)).toBe(true);
    expect(survivor.dialog.getAttribute('aria-modal')).toBe('true');
    survivorBinding.destroy?.();
    frozenBinding.destroy?.();
    await flushRemoval();
    feedback.destroy();
  });

  it('clears the exact binding at zero entries and permits a clean App remount', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const first = modalFeedback(host);
    const firstRenderer = host.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    first.destroy();

    expect(firstRenderer?.isConnected).toBe(false);
    expect(host.hasAttribute('data-modal-feedback-host')).toBe(false);
    const second = modalFeedback(host);
    const secondRenderer = host.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    expect(secondRenderer).not.toBe(firstRenderer);
    expect(document.querySelectorAll('[data-modal-feedback-renderer]')).toHaveLength(1);

    first.destroy();
    expect(secondRenderer?.isConnected).toBe(true);
    second.destroy();
  });

  it.each(NESTING_ORDERS)(
    'keeps one renderer under pairwise nesting %s through rejected and throwing closes',
    async (_label, firstCase, secondCase) => {
      const host = document.createElement('div');
      document.body.append(host);
      const feedback = modalFeedback(host);
      const renderer = host.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
      const first = createSurface(firstCase.id);
      const firstBinding = modalFocus(
        first.root,
        surfaceOptions(firstCase, `${firstCase.id}-first`)
      );
      const rejectedClose = vi.fn(() => 'rejected' as const);
      const second = createSurface(secondCase.id);
      const secondBinding = modalFocus(
        second.root,
        surfaceOptions(secondCase, `${secondCase.id}-second`, rejectedClose)
      );
      await flushRemoval();

      expect(second.dialog.contains(renderer)).toBe(true);
      expect(requestModalClose(second.root, 'explicit')).toBe(true);
      expect(rejectedClose).toHaveBeenCalledOnce();
      expect(second.dialog.contains(renderer)).toBe(true);
      expect(second.dialog.getAttribute('aria-modal')).toBe('true');

      const throwingClose = vi.fn(() => {
        throw new Error('close rejected by throw');
      });
      secondBinding.update?.(surfaceOptions(secondCase, `${secondCase.id}-second`, throwingClose));
      expect(requestModalClose(second.root, 'explicit')).toBe(true);
      expect(throwingClose).toHaveBeenCalledOnce();
      expect(second.dialog.contains(renderer)).toBe(true);
      expect(second.dialog.getAttribute('aria-modal')).toBe('true');

      secondBinding.destroy?.();
      await flushRemoval();
      expect(first.dialog.contains(renderer)).toBe(true);
      expect(first.dialog.getAttribute('aria-modal')).toBe('true');
      firstBinding.destroy?.();
      await flushRemoval();
      expect(renderer?.parentElement).toBe(host);
      feedback.destroy();
    }
  );

  it('ignores copied text, CSS and a hostile DOM clone as modal or feedback transitions', async () => {
    const close = vi.fn(() => 'rejected' as const);
    const surface = createSurface('Stable');
    const modalBinding = modalFocus(surface.root, options({ onBeforeClose: close }));
    await flushRemoval();
    const host = document.createElement('div');
    document.body.append(host);
    const feedback = modalFeedback(host);
    const renderer = surface.dialog.querySelector<HTMLElement>('[data-modal-feedback-renderer]');

    renderer?.setAttribute('data-action-label', 'Annuler');
    renderer?.style.setProperty('z-index', '9999999');
    renderer?.append('Texte copié sans intention typée');
    const clone = renderer?.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-modal-feedback-renderer');
    document.body.append(clone);

    expect(requestModalClose(clone, 'explicit')).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(surface.dialog.getAttribute('aria-modal')).toBe('true');
    expect(surface.root.inert).toBe(false);
    expect(surface.dialog.contains(renderer)).toBe(true);

    clone.remove();
    modalBinding.destroy?.();
    await flushRemoval();
    feedback.destroy();
  });

  it('requires an explicit direct-body overlay marker at registry construction', () => {
    const isolated = document.implementation.createHTMLDocument('modal-registry');
    const overlay = isolated.createElement('div');
    const fallback = isolated.createElement('button');
    isolated.body.append(fallback, overlay);

    expect(() => createModalRegistry(isolated, overlay, fallback)).toThrow(
      'INVALID_MODAL_REGISTRY_CONSTRUCTION'
    );
    overlay.setAttribute('data-modal-surface-root', '');
    expect(createModalRegistry(isolated, overlay, fallback).overlayRoot).toBe(overlay);
  });
});
