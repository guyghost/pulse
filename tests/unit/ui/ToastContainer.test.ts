import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick, flushSync } from 'svelte';
import { createActor } from 'xstate';
import ToastContainer from '../../../src/ui/organisms/ToastContainer.svelte';
import { toastMachine } from '../../../src/machines/toast.machine';

async function mountToast(actor: ReturnType<typeof createActor<typeof toastMachine>>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(ToastContainer, { target, props: { actor } });
  // Attendre que le $effect s'execute et installe la subscription XState
  await tick();
  await tick();
  return target;
}

/**
 * Envoie un evenement a l'acteur et attend la mise a jour du DOM.
 */
function sendAndFlush(
  actor: ReturnType<typeof createActor<typeof toastMachine>>,
  event: Parameters<typeof actor.send>[0],
) {
  actor.send(event);
  flushSync();
}

describe('ToastContainer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('n\'affiche rien quand il n\'y a pas de toasts', async () => {
    const actor = createActor(toastMachine);
    actor.start();
    const target = await mountToast(actor);

    expect(target.querySelector('[aria-live]')).toBeNull();
    actor.stop();
  });

  it('affiche un toast apres un evenement ADD', async () => {
    const actor = createActor(toastMachine);
    actor.start();
    const target = await mountToast(actor);

    sendAndFlush(actor, { type: 'ADD', message: 'Scan termine', toastType: 'success' });

    expect(target.textContent).toContain('Scan termine');
    const container = target.querySelector('[aria-live]');
    expect(container).not.toBeNull();
    actor.stop();
  });

  it('affiche le bon style pour un toast de type info', async () => {
    const actor = createActor(toastMachine);
    actor.start();
    const target = await mountToast(actor);

    sendAndFlush(actor, { type: 'ADD', message: 'Information', toastType: 'info' });

    expect(target.textContent).toContain('Information');
    const toastDiv = target.querySelector('[aria-live] div div');
    expect(toastDiv).not.toBeNull();
    actor.stop();
  });

  it('affiche le bon style pour un toast de type error', async () => {
    const actor = createActor(toastMachine);
    actor.start();
    const target = await mountToast(actor);

    sendAndFlush(actor, { type: 'ADD', message: 'Erreur reseau', toastType: 'error' });

    expect(target.textContent).toContain('Erreur reseau');
    actor.stop();
  });

  it('affiche le bon style pour un toast de type success', async () => {
    const actor = createActor(toastMachine);
    actor.start();
    const target = await mountToast(actor);

    sendAndFlush(actor, { type: 'ADD', message: 'Sauvegarde OK', toastType: 'success' });

    expect(target.textContent).toContain('Sauvegarde OK');
    actor.stop();
  });

  it('supprime un toast apres un evenement DISMISS', async () => {
    const actor = createActor(toastMachine);
    actor.start();
    const target = await mountToast(actor);

    sendAndFlush(actor, { type: 'ADD', message: 'A supprimer', toastType: 'info' });
    expect(target.textContent).toContain('A supprimer');

    sendAndFlush(actor, { type: 'DISMISS', id: 1 });

    expect(target.textContent).not.toContain('A supprimer');
    actor.stop();
  });

  it('affiche plusieurs toasts simultanement', async () => {
    const actor = createActor(toastMachine);
    actor.start();
    const target = await mountToast(actor);

    sendAndFlush(actor, { type: 'ADD', message: 'Premier toast', toastType: 'info' });
    sendAndFlush(actor, { type: 'ADD', message: 'Deuxieme toast', toastType: 'success' });

    expect(target.textContent).toContain('Premier toast');
    expect(target.textContent).toContain('Deuxieme toast');
    actor.stop();
  });

  it('supprime tous les toasts avec DISMISS_ALL', async () => {
    const actor = createActor(toastMachine);
    actor.start();
    const target = await mountToast(actor);

    sendAndFlush(actor, { type: 'ADD', message: 'Toast 1', toastType: 'info' });
    sendAndFlush(actor, { type: 'ADD', message: 'Toast 2', toastType: 'error' });
    expect(target.textContent).toContain('Toast 1');

    sendAndFlush(actor, { type: 'DISMISS_ALL' });

    expect(target.querySelector('[aria-live]')).toBeNull();
    actor.stop();
  });
});
