/**
 * Horizontal swipe-to-triage gesture for feed mission cards
 * (models/mission-card-swipe.model.md).
 *
 * Right swipe ≥ threshold → onSwipeRight (favorite), left swipe ≤ -threshold →
 * onSwipeLeft (hide). Sub-threshold releases spring back and let the click
 * behave normally. Vertical scrolling stays master until horizontal intent is
 * established (|dx| > |dy| within the first 8px).
 */

export interface SwipeOptions {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  /** Gesture gate (e.g. disabled in compare mode). Default true. */
  enabled?: boolean;
  /** Validation threshold in px. Default 48. */
  threshold?: number;
  /** Maximum translation in px before elastic resistance. Default 96. */
  maxTranslate?: number;
}

import { iconPaths } from '@pulse/ui';

const INTENT_DISTANCE = 8;

function iconSvg(name: 'heart' | 'eye-off'): string {
  const children = iconPaths[name]
    .map((child) => {
      const [tag, attrs] = child;
      const attrString = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${attrString}></${tag}>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

export function swipe(node: HTMLElement, options: SwipeOptions) {
  let currentOptions = options;
  const threshold = () => currentOptions.threshold ?? 48;
  const maxTranslate = () => currentOptions.maxTranslate ?? 96;

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let horizontal = false;
  let currentDx = 0; // raw pointer delta, used for threshold validation
  let suppressNextClick = false;

  const overlay = document.createElement('div');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = `
    position: absolute; inset: 0; border-radius: inherit;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none; opacity: 0; z-index: 5;
    font-size: 22px;
  `;
  node.appendChild(overlay);

  function render(dx: number) {
    const progress = Math.min(Math.abs(dx) / threshold(), 1);
    node.style.transform = `translateX(${dx}px)`;
    node.style.transition = 'none';
    if (dx > 0) {
      overlay.style.justifyContent = 'flex-start';
      overlay.style.paddingLeft = '20px';
      overlay.innerHTML = iconSvg('heart');
      overlay.style.color = 'rgba(11,100,233,0.9)';
    } else if (dx < 0) {
      overlay.style.justifyContent = 'flex-end';
      overlay.style.paddingRight = '20px';
      overlay.innerHTML = iconSvg('eye-off');
      overlay.style.color = 'rgba(242,65,73,0.9)';
    } else {
      overlay.innerHTML = '';
    }
    overlay.style.opacity = String(progress * 0.85);
  }

  function reset(animate = true) {
    dragging = false;
    horizontal = false;
    currentDx = 0;
    if (animate) {
      node.style.transition = 'transform 200ms ease-out';
    }
    node.style.transform = '';
    overlay.style.opacity = '0';
  }

  function handlePointerDown(event: PointerEvent) {
    if (pointerId !== null || currentOptions.enabled === false) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    horizontal = false;
    currentDx = 0;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!horizontal) {
      if (Math.abs(dx) < INTENT_DISTANCE && Math.abs(dy) < INTENT_DISTANCE) {
        return;
      }
      if (Math.abs(dx) <= Math.abs(dy)) {
        // Vertical intent: release the gesture, scroll stays master.
        reset(false);
        pointerId = null;
        dragging = false;
        return;
      }
      horizontal = true;
    }

    event.preventDefault();
    currentDx = dx;
    // Elastic resistance beyond the threshold, hard cap at maxTranslate.
    // Visual only: threshold validation above uses the raw delta.
    const overshoot = Math.abs(dx) > threshold() ? 0.35 : 1;
    const bounded = Math.min(Math.abs(dx) * overshoot, maxTranslate());
    render(Math.sign(dx) * bounded);
  }

  function handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return;
    }
    pointerId = null;
    if (horizontal) {
      suppressNextClick = true;
      if (currentDx >= threshold()) {
        currentOptions.onSwipeRight();
      } else if (currentDx <= -threshold()) {
        currentOptions.onSwipeLeft();
      }
    }
    reset();
  }

  function handleClickCapture(event: MouseEvent) {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handlePointerCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return;
    }
    pointerId = null;
    reset();
  }

  node.style.touchAction = 'pan-y';
  node.addEventListener('pointerdown', handlePointerDown);
  node.addEventListener('pointermove', handlePointerMove, { passive: false });
  node.addEventListener('pointerup', handlePointerUp);
  node.addEventListener('pointercancel', handlePointerCancel);
  node.addEventListener('click', handleClickCapture, true);

  return {
    update(newOptions: SwipeOptions) {
      currentOptions = newOptions;
      if (newOptions.enabled === false) {
        reset();
      }
    },
    destroy() {
      node.removeEventListener('pointerdown', handlePointerDown);
      node.removeEventListener('pointermove', handlePointerMove);
      node.removeEventListener('pointerup', handlePointerUp);
      node.removeEventListener('pointercancel', handlePointerCancel);
      node.removeEventListener('click', handleClickCapture, true);
      overlay.remove();
      node.style.transform = '';
      node.style.touchAction = '';
    },
  };
}
