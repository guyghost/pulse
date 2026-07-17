import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushSync } from 'svelte';
import { ToastStore } from '../../../src/lib/state/toast.svelte.ts';
import ToastContainer from '../../../src/ui/organisms/ToastContainer.svelte';
import { modalFocus, type ModalFocusOptions } from '../../../src/lib/shell/ui/modal-focus';

function mountToast(store: ToastStore) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(ToastContainer, { target, props: { store } });
  return target;
}

/**
 * Ajoute un toast au store et attend la mise à jour du DOM.
 */
function addAndFlush(
  store: ToastStore,
  message: string,
  type: 'info' | 'error' | 'success' = 'info'
) {
  store.add(message, type);
  flushSync();
}

function createInvestigationSurface() {
  const root = document.createElement('div');
  const dialog = document.createElement('div');
  const close = document.createElement('button');
  dialog.setAttribute('role', 'dialog');
  dialog.tabIndex = -1;
  close.textContent = 'Fermer';
  close.setAttribute('data-modal-initial-focus', '');
  dialog.append(close);
  root.append(dialog);
  document.body.append(root);
  const modalOptions: ModalFocusOptions = {
    surface: 'mission_investigation',
    variant: 'investigation',
    ownerScopePath: ['feed', 'investigation'],
    onBeforeClose: () => 'accepted',
    onRejected: () => {},
  };
  return { root, dialog, close, binding: modalFocus(root, modalOptions) };
}

describe('ToastContainer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("n'affiche rien quand il n'y a pas de toasts", () => {
    const store = new ToastStore();
    const target = mountToast(store);
    flushSync();

    expect(target.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(target.querySelector('[role="alert"]')).toBeNull();
    store.destroy();
  });

  it('affiche un toast apres un add', () => {
    const store = new ToastStore();
    const target = mountToast(store);

    addAndFlush(store, 'Scan termine', 'success');

    expect(target.textContent).toContain('Scan termine');
    const container = target.querySelector('[aria-live]');
    expect(container).not.toBeNull();
    store.destroy();
  });

  it('affiche le bon style pour un toast de type info', () => {
    const store = new ToastStore();
    const target = mountToast(store);

    addAndFlush(store, 'Information', 'info');

    expect(target.textContent).toContain('Information');
    const toastDiv = target.querySelector('[aria-live] div div');
    expect(toastDiv).not.toBeNull();
    store.destroy();
  });

  it('affiche le bon style pour un toast de type error', () => {
    const store = new ToastStore();
    const target = mountToast(store);

    addAndFlush(store, 'Erreur reseau', 'error');

    expect(target.textContent).toContain('Erreur reseau');
    store.destroy();
  });

  it('affiche le bon style pour un toast de type success', () => {
    const store = new ToastStore();
    const target = mountToast(store);

    addAndFlush(store, 'Sauvegarde OK', 'success');

    expect(target.textContent).toContain('Sauvegarde OK');
    store.destroy();
  });

  it('supprime un toast apres un dismiss', () => {
    const store = new ToastStore();
    const target = mountToast(store);

    addAndFlush(store, 'A supprimer', 'info');
    expect(target.textContent).toContain('A supprimer');

    store.dismiss(1);
    flushSync();

    expect(target.textContent).not.toContain('A supprimer');
    store.destroy();
  });

  it('affiche plusieurs toasts simultanement', () => {
    const store = new ToastStore();
    const target = mountToast(store);

    addAndFlush(store, 'Premier toast', 'info');
    addAndFlush(store, 'Deuxieme toast', 'success');

    expect(target.textContent).toContain('Premier toast');
    expect(target.textContent).toContain('Deuxieme toast');
    store.destroy();
  });

  it('supprime tous les toasts avec dismissAll', () => {
    const store = new ToastStore();
    const target = mountToast(store);

    addAndFlush(store, 'Toast 1', 'info');
    addAndFlush(store, 'Toast 2', 'error');
    expect(target.textContent).toContain('Toast 1');

    store.dismissAll();
    flushSync();

    expect(target.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(target.querySelector('[role="alert"]')).toBeNull();
    store.destroy();
  });

  it('moves one actionable renderer into the typed topmost dialog and back without recreating it', async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const store = new ToastStore();
    const action = vi.fn();
    const target = mountToast(store);
    store.add('Statut: Sélectionnée', 'success', 60_000, {
      label: 'Annuler',
      onClick: action,
    });
    flushSync();
    const renderer = target.querySelector<HTMLElement>('[aria-live="polite"]');
    const actionButton = target.querySelector<HTMLButtonElement>('button');
    const item = store.toasts[0];
    const originalDeadline = item.createdAt + item.duration;
    const toastTimerRegistrations = () =>
      timeoutSpy.mock.calls.filter(([, delay]) => delay === 60_000).length;

    const root = document.createElement('div');
    const dialog = document.createElement('div');
    const close = document.createElement('button');
    dialog.setAttribute('role', 'dialog');
    dialog.tabIndex = -1;
    close.textContent = 'Fermer';
    close.setAttribute('data-modal-initial-focus', '');
    dialog.append(close);
    root.append(dialog);
    document.body.append(root);
    const modalOptions: ModalFocusOptions = {
      surface: 'mission_investigation',
      variant: 'investigation',
      ownerScopePath: ['feed', 'investigation'],
      onBeforeClose: () => 'accepted',
      onRejected: () => {},
    };
    const binding = modalFocus(root, modalOptions);
    await Promise.resolve();

    expect(renderer).not.toBeNull();
    expect(actionButton).not.toBeNull();
    expect(dialog.contains(renderer)).toBe(true);
    expect(dialog.contains(actionButton)).toBe(true);
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(store.toasts[0]).toBe(item);
    expect(store.toasts[0].createdAt + store.toasts[0].duration).toBe(originalDeadline);
    expect(toastTimerRegistrations()).toBe(1);

    binding.destroy?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(target.contains(renderer)).toBe(true);
    expect(target.contains(actionButton)).toBe(true);
    expect(action).not.toHaveBeenCalled();
    expect(store.toasts[0]).toBe(item);
    expect(toastTimerRegistrations()).toBe(1);
    actionButton?.click();
    flushSync();
    expect(action).toHaveBeenCalledOnce();
    expect(store.toasts).toHaveLength(0);
    expect(toastTimerRegistrations()).toBe(1);
    timeoutSpy.mockRestore();
    store.destroy();
  });

  it('never inserts a pre-existing toast item in the application host before its first modal paint', async () => {
    const store = new ToastStore();
    store.add('Née sous la modale', 'success', 60_000, {
      label: 'Annuler',
      onClick: () => {},
    });
    const surface = createInvestigationSurface();
    await Promise.resolve();
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(document.body, { childList: true, subtree: true });

    const target = mountToast(store);
    flushSync();
    await Promise.resolve();
    observer.disconnect();
    const host = target.querySelector<HTMLElement>('[data-feedback-application-host]');
    const renderer = document.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    const externalItemInsertions = mutations.filter(
      (record) =>
        record.target === host &&
        [...record.addedNodes].some(
          (node) => node !== renderer && node.textContent?.includes('Née sous la modale')
        )
    );

    expect(host).not.toBeNull();
    expect(surface.dialog.contains(renderer)).toBe(true);
    expect(externalItemInsertions).toHaveLength(0);
    expect(
      mutations.some(
        (record) =>
          record.target === renderer &&
          [...record.addedNodes].some((node) => node.textContent?.includes('Née sous la modale'))
      )
    ).toBe(true);

    surface.binding.destroy?.();
    await Promise.resolve();
    await Promise.resolve();
    store.destroy();
  });

  it('keeps actionable and plain feedback in one semantic live region without duplication', async () => {
    const store = new ToastStore();
    const action = vi.fn();
    const target = mountToast(store);
    store.add('Action disponible', 'success', 60_000, {
      label: 'Annuler',
      onClick: action,
    });
    store.add('Information simple', 'info', 60_000);
    flushSync();
    const renderer = target.querySelector<HTMLElement>('[data-modal-feedback-renderer]');
    const actionMessage = [...document.querySelectorAll('p')].find(
      (node) => node.textContent === 'Action disponible'
    );
    const plainMessage = [...document.querySelectorAll('p')].find(
      (node) => node.textContent === 'Information simple'
    );

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
    expect(actionMessage).toBeDefined();
    expect(plainMessage).toBeDefined();
    expect(document.body.textContent?.match(/Action disponible/g)).toHaveLength(1);
    expect(document.body.textContent?.match(/Information simple/g)).toHaveLength(1);

    const surface = createInvestigationSurface();
    await Promise.resolve();
    expect(surface.dialog.contains(renderer)).toBe(true);
    expect(surface.dialog.contains(actionMessage ?? null)).toBe(true);
    expect(surface.dialog.contains(plainMessage ?? null)).toBe(true);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
    expect(action).not.toHaveBeenCalled();

    surface.binding.destroy?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(target.contains(renderer)).toBe(true);
    expect(target.contains(actionMessage ?? null)).toBe(true);
    expect(target.contains(plainMessage ?? null)).toBe(true);
    store.destroy();
  });

  it('tabs forward and backward through the modal action then recovers focus after dismissal', async () => {
    const store = new ToastStore();
    const action = vi.fn();
    const target = mountToast(store);
    store.add('Statut modifié', 'success', 60_000, {
      label: 'Annuler',
      onClick: action,
    });
    flushSync();
    const surface = createInvestigationSurface();
    await Promise.resolve();
    await Promise.resolve();
    const actionButton = surface.dialog.querySelector<HTMLButtonElement>(
      'button:not([data-modal-initial-focus]):not([aria-label])'
    );
    const dismissButton = surface.dialog.querySelector<HTMLButtonElement>(
      'button[aria-label="Fermer la notification"]'
    );

    expect(document.activeElement).toBe(surface.close);
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(dismissButton);
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(surface.close);

    actionButton?.focus();
    expect(document.activeElement).toBe(actionButton);
    actionButton?.click();
    flushSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(action).toHaveBeenCalledOnce();
    expect(store.toasts).toHaveLength(0);
    expect(document.activeElement).toBe(surface.close);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);

    surface.binding.destroy?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(target.querySelector('[data-modal-feedback-renderer]')).not.toBeNull();
    store.destroy();
  });
});
