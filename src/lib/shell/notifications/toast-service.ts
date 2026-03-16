import { createActor, type AnyActorRef } from 'xstate';
import {
  toastMachine,
  toastEvents,
  type ToastType,
  type ToastItem,
} from '../../../machines/toast.machine';
import { sendMessage } from '../messaging/bridge';

// Global singleton actor for toast management
let toastActor: AnyActorRef | null = null;

// Track active dismiss timers
const activeTimers = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * Initialize the toast service.
 * Should be called once at app startup in the side panel.
 */
export function initToastService(): AnyActorRef {
  if (!toastActor) {
    toastActor = createActor(toastMachine);
    
    // Listen for state changes to manage dismiss timers
    toastActor.subscribe((snapshot) => {
      const toasts = snapshot.context.toasts;
      const currentIds = new Set<number>(toasts.map((t: ToastItem) => t.id));
      
      // Clear timers for dismissed toasts
      for (const [id, timer] of activeTimers) {
        if (!currentIds.has(id)) {
          clearTimeout(timer);
          activeTimers.delete(id);
        }
      }
      
      // Set timers for new toasts
      for (const toast of toasts as ToastItem[]) {
        if (!activeTimers.has(toast.id)) {
          const timer = setTimeout(() => {
            activeTimers.delete(toast.id);
            toastActor?.send({ type: 'AUTO_DISMISS', id: toast.id });
          }, toast.duration);
          activeTimers.set(toast.id, timer);
        }
      }
    });
    
    toastActor.start();
  }
  return toastActor;
}

/**
 * Get the toast actor instance.
 * Returns null if not initialized.
 */
export function getToastActor(): AnyActorRef | null {
  return toastActor;
}

/**
 * Show a toast notification.
 * Works from both side panel and background context.
 */
export async function showToast(
  message: string,
  toastType: ToastType = 'info',
  duration?: number,
): Promise<void> {
  // If we have a local actor (side panel context), use it directly
  if (toastActor) {
    toastActor.send(toastEvents.add(message, toastType, duration));
    return;
  }

  // Otherwise, try to send via messaging bridge (for background context)
  try {
    await sendMessage({
      type: 'SHOW_TOAST',
      payload: { message, toastType, duration },
    });
  } catch {
    // Silent fail if messaging is not available
    console.warn('[ToastService] Failed to show toast:', message);
  }
}

/**
 * Dismiss a specific toast by ID.
 */
export function dismissToast(id: number): void {
  if (toastActor) {
    // Clear the timer if it exists
    const timer = activeTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(id);
    }
    toastActor.send(toastEvents.dismiss(id));
  }
}

/**
 * Dismiss all toasts.
 */
export function dismissAllToasts(): void {
  // Clear all timers
  for (const timer of activeTimers.values()) {
    clearTimeout(timer);
  }
  activeTimers.clear();
  
  if (toastActor) {
    toastActor.send(toastEvents.dismissAll());
  }
}

/**
 * Stop the toast service.
 * Should be called when the app is destroyed.
 */
export function stopToastService(): void {
  // Clear all timers
  for (const timer of activeTimers.values()) {
    clearTimeout(timer);
  }
  activeTimers.clear();
  
  if (toastActor) {
    toastActor.stop();
    toastActor = null;
  }
}
