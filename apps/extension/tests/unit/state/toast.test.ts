import { ToastStore } from '../../../src/lib/state/toast.svelte.ts';

describe('ToastStore', () => {
  it('démarre avec des toasts vides et nextId à 1', () => {
    const store = new ToastStore();
    expect(store.toasts).toHaveLength(0);
    expect(store.nextId).toBe(1);
    store.destroy();
  });

  it('ajoute un toast avec le bon contexte (id, message, type, durée)', () => {
    const store = new ToastStore();
    store.add('Test toast', 'info');

    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].id).toBe(1);
    expect(store.toasts[0].message).toBe('Test toast');
    expect(store.toasts[0].toastType).toBe('info');
    expect(store.toasts[0].duration).toBe(4000);
    expect(typeof store.toasts[0].createdAt).toBe('number');
    store.destroy();
  });

  it('utilise la durée par défaut de 4000ms', () => {
    const store = new ToastStore();
    store.add('Default duration', 'info');

    expect(store.toasts[0].duration).toBe(4000);
    store.destroy();
  });

  it('respecte la durée personnalisée', () => {
    const store = new ToastStore();
    store.add('Custom', 'info', 8000);

    expect(store.toasts[0].duration).toBe(8000);
    store.destroy();
  });

  it('incrémente nextId correctement', () => {
    const store = new ToastStore();
    store.add('First', 'info');
    store.add('Second', 'error');
    store.add('Third', 'success');

    expect(store.toasts[0].id).toBe(1);
    expect(store.toasts[1].id).toBe(2);
    expect(store.toasts[2].id).toBe(3);
    expect(store.nextId).toBe(4);
    store.destroy();
  });

  it('applique la limite max de 5 toasts avec éviction FIFO', () => {
    const store = new ToastStore();

    for (let i = 1; i <= 6; i++) {
      store.add(`Toast ${i}`, 'info');
    }

    expect(store.toasts).toHaveLength(5);
    // Le plus ancien (Toast 1) doit avoir été évincé
    expect(store.toasts[0].message).toBe('Toast 2');
    expect(store.toasts[4].message).toBe('Toast 6');
    store.destroy();
  });

  it('supprime un toast spécifique par ID', () => {
    const store = new ToastStore();
    store.add('First', 'info');
    store.add('Second', 'error');

    store.dismiss(1);

    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].id).toBe(2);
    expect(store.toasts[0].message).toBe('Second');
    store.destroy();
  });

  it('supprime tous les toasts', () => {
    const store = new ToastStore();
    store.add('First', 'info');
    store.add('Second', 'error');
    store.add('Third', 'success');

    store.dismissAll();

    expect(store.toasts).toHaveLength(0);
    store.destroy();
  });

  it('auto-supprime un toast par ID', () => {
    const store = new ToastStore();
    store.add('First', 'info');
    store.add('Second', 'error');

    store.autoDismiss(1);

    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].id).toBe(2);
    store.destroy();
  });

  it('ajoute un toast de type info', () => {
    const store = new ToastStore();
    store.add('Info toast', 'info');
    expect(store.toasts[0].toastType).toBe('info');
    store.destroy();
  });

  it('ajoute un toast de type error', () => {
    const store = new ToastStore();
    store.add('Error toast', 'error');
    expect(store.toasts[0].toastType).toBe('error');
    store.destroy();
  });

  it('ajoute un toast de type success', () => {
    const store = new ToastStore();
    store.add('Success toast', 'success');
    expect(store.toasts[0].toastType).toBe('success');
    store.destroy();
  });
});
