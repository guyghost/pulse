import { ToastStore, type ToastAction, type ToastType } from '$lib/state/toast.svelte';
import { sendMessage } from '../messaging/bridge';

// Singleton global pour la gestion des toasts
let toastStore: ToastStore | null = null;

/**
 * Initializes the toast service.
 * Call once at app startup in the side panel.
 */
export function initToastService(): ToastStore {
  if (!toastStore) {
    toastStore = new ToastStore();
  }
  return toastStore;
}

/**
 * Returns the toast store instance.
 * Returns null if not initialized.
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
  duration?: number
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
    if (import.meta.env.DEV) {
      console.warn('[ToastService] Failed to show toast:', message);
    }
  }
}

export function showToastAction(
  message: string,
  toastType: ToastType,
  action: ToastAction,
  duration = 6000
): number | undefined {
  if (toastStore) {
    return toastStore.add(message, toastType, duration, action);
  }
  return undefined;
}

/**
 * Dismisses a specific toast by ID.
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
 * Stops the toast service.
 * Call when the app is destroyed.
 */
export function stopToastService(): void {
  if (toastStore) {
    toastStore.destroy();
    toastStore = null;
  }
}
