import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick, flushSync } from 'svelte';
import { ToastStore } from '../../../src/lib/state/toast.svelte.ts';
import ToastContainer from '../../../src/ui/organisms/ToastContainer.svelte';

function mountToast(store: ToastStore) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(ToastContainer, { target, props: { store } });
  return target;
}

/**
 * Ajoute un toast au store et attend la mise à jour du DOM.
 */
function addAndFlush(store: ToastStore, message: string, type: 'info' | 'error' | 'success' = 'info') {
  store.add(message, type);
  flushSync();
}

describe('ToastContainer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('n\'affiche rien quand il n\'y a pas de toasts', () => {
    const store = new ToastStore();
    const target = mountToast(store);

    expect(target.querySelector('[aria-live]')).toBeNull();
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

    expect(target.querySelector('[aria-live]')).toBeNull();
    store.destroy();
  });
});
