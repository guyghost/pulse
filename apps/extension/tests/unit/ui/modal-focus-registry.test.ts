import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  modalFocus,
  createModalRegistry,
  requestModalClose,
  teardownModalScope,
  type ModalFocusOptions,
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
