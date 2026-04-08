/**
 * Action Svelte pour gérer le virtual scroll.
 *
 * Throttle le scroll à 60fps (16ms) et gère le resize du container.
 */

import type { ActionReturn } from 'svelte/action';

export interface VirtualScrollOptions {
  onScroll: (scrollTop: number, containerHeight: number) => void;
  throttleMs?: number;
}

export interface VirtualScrollAttributes {
  'on:virtual-scroll'?: (e: CustomEvent<{ scrollTop: number; containerHeight: number }>) => void;
}

/**
 * Throttle une fonction pour limiter son exécution.
 */
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  let rafId: number | null = null;
  let pendingArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    pendingArgs = args;
    const now = performance.now();
    const elapsed = now - lastTime;

    if (elapsed >= ms) {
      // Exécuter immédiatement si assez de temps s'est écoulé
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      lastTime = now;
      pendingArgs = null;
      fn(...args);
    } else if (rafId === null) {
      // Programmer pour plus tard si pas encore de RAF en attente
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pendingArgs !== null) {
          lastTime = performance.now();
          fn(...pendingArgs);
          pendingArgs = null;
        }
      });
    }
  };
}

/**
 * Action Svelte pour le virtual scroll.
 *
 * Usage:
 * ```svelte
 * <div use:virtualScroll={{ onScroll: (scrollTop, height) => {...} }}>
 *   ...
 * </div>
 * ```
 */
export function virtualScroll(
  node: HTMLElement,
  options: VirtualScrollOptions
): ActionReturn<VirtualScrollOptions, VirtualScrollAttributes> {
  const { onScroll, throttleMs = 16 } = options; // 16ms = ~60fps

  let currentScrollTop = node.scrollTop;
  let currentContainerHeight = node.clientHeight;

  // Notifier la position initiale
  onScroll(currentScrollTop, currentContainerHeight);

  // Handler de scroll throttlé
  const handleScroll = throttle(() => {
    currentScrollTop = node.scrollTop;
    onScroll(currentScrollTop, currentContainerHeight);
  }, throttleMs);

  // Handler de resize avec ResizeObserver
  let resizeObserver: ResizeObserver | null = null;

  const handleResize = throttle(() => {
    const newHeight = node.clientHeight;
    if (newHeight !== currentContainerHeight) {
      currentContainerHeight = newHeight;
      onScroll(currentScrollTop, currentContainerHeight);
    }
  }, throttleMs);

  // Setup
  node.addEventListener('scroll', handleScroll, { passive: true });

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(node);
  }

  return {
    update(newOptions: VirtualScrollOptions) {
      // Mettre à jour le callback si nécessaire
      Object.assign(options, newOptions);
    },
    destroy() {
      node.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
    },
    // Exposer une méthode pour forcer le refresh depuis l'extérieur
  };
}

/**
 * Helper pour créer un refresh manuel.
 */
export function createVirtualScrollController() {
  let refreshCallback: (() => void) | null = null;

  return {
    register(callback: () => void) {
      refreshCallback = callback;
    },
    unregister() {
      refreshCallback = null;
    },
    refresh() {
      refreshCallback?.();
    },
  };
}
