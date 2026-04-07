export type ToastType = 'info' | 'error' | 'success';

export interface ToastItem {
  id: number;
  message: string;
  toastType: ToastType;
  createdAt: number;
  duration: number;
}

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;

const addToast = (toasts: ToastItem[], newToast: ToastItem, maxCount: number): ToastItem[] => {
  const newToasts = [...toasts, newToast];
  if (newToasts.length > maxCount) {
    return newToasts.slice(newToasts.length - maxCount);
  }
  return newToasts;
};

export class ToastStore {
  toasts: ToastItem[] = $state([]);
  nextId: number = $state(1);

  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  add(message: string, toastType: ToastType = 'info', duration?: number): void {
    const resolvedDuration = duration ?? DEFAULT_DURATION;
    const newToast: ToastItem = {
      id: this.nextId,
      message,
      toastType,
      createdAt: Date.now(),
      duration: resolvedDuration,
    };

    this.toasts = addToast(this.toasts, newToast, MAX_TOASTS);
    const id = this.nextId;
    this.nextId = this.nextId + 1;

    const timer = setTimeout(() => {
      this.timers.delete(id);
      this.autoDismiss(id);
    }, resolvedDuration);
    this.timers.set(id, timer);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  dismissAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.toasts = [];
  }

  autoDismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  destroy(): void {
    this.dismissAll();
  }
}
