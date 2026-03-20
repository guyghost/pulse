import { ToastStore, type ToastType } from '$lib/state/toast.svelte.ts';
import { sendMessage } from '../messaging/bridge';

// Singleton global pour la gestion des toasts
let toastStore: ToastStore | null = null;

/**
 * Initialise le service de toast.
 * A appeler une fois au démarrage de l'app dans le side panel.
 */
export function initToastService(): ToastStore {
  if (!toastStore) {
    toastStore = new ToastStore();
  }
  return toastStore;
}

/**
 * Retourne l'instance du store de toasts.
 * Retourne null si non initialisé.
 */
export function getToastActor(): ToastStore | null {
  return toastStore;
}

/**
 * Affiche une notification toast.
 * Fonctionne depuis le side panel et le contexte background.
 */
export async function showToast(
  message: string,
  toastType: ToastType = 'info',
  duration?: number,
): Promise<void> {
  if (toastStore) {
    toastStore.add(message, toastType, duration);
    return;
  }

  // Sinon, envoyer via le bridge de messagerie (contexte background)
  try {
    await sendMessage({
      type: 'SHOW_TOAST',
      payload: { message, toastType, duration },
    });
  } catch {
    console.warn('[ToastService] Failed to show toast:', message);
  }
}

/**
 * Ferme un toast spécifique par ID.
 */
export function dismissToast(id: number): void {
  if (toastStore) {
    toastStore.dismiss(id);
  }
}

/**
 * Ferme tous les toasts.
 */
export function dismissAllToasts(): void {
  if (toastStore) {
    toastStore.dismissAll();
  }
}

/**
 * Arrête le service de toast.
 * A appeler quand l'app est détruite.
 */
export function stopToastService(): void {
  if (toastStore) {
    toastStore.destroy();
    toastStore = null;
  }
}
