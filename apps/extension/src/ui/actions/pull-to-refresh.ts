export interface PullToRefreshOptions {
  onRefresh: () => void;
  threshold?: number;
}

export function pullToRefresh(node: HTMLElement, options: PullToRefreshOptions) {
  const threshold = options.threshold ?? 60;
  let startY = 0;
  let pulling = false;
  let indicator: HTMLDivElement | null = null;

  function createIndicator() {
    indicator = document.createElement('div');
    indicator.style.cssText = `
      position: absolute; top: 0; left: 50%; transform: translateX(-50%) translateY(-40px);
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(255,255,255,0.1); backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center;
      transition: transform 200ms ease-out; z-index: 10;
      font-size: 14px; color: rgba(255,255,255,0.5);
    `;
    indicator.textContent = '\u21BB';
    if (!node.style.position || node.style.position === 'static') {
      node.style.position = 'relative';
    }
    node.appendChild(indicator);
  }

  function handlePointerDown(e: PointerEvent) {
    if (node.scrollTop > 0) return;
    startY = e.clientY;
    pulling = true;
  }

  function handlePointerMove(e: PointerEvent) {
    if (!pulling) return;
    const delta = Math.max(0, e.clientY - startY);
    if (delta > 5 && !indicator) {
      createIndicator();
    }
    if (indicator) {
      const progress = Math.min(delta / threshold, 1);
      indicator.style.transform = `translateX(-50%) translateY(${delta * 0.5 - 40}px) rotate(${progress * 360}deg)`;
      indicator.style.opacity = String(Math.min(progress * 1.5, 1));
    }
  }

  function cleanup() {
    pulling = false;
    if (indicator) {
      indicator.style.transform = 'translateX(-50%) translateY(-40px)';
      indicator.style.opacity = '0';
      const ref = indicator;
      setTimeout(() => ref.remove(), 200);
      indicator = null;
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (!pulling) return;
    const delta = e.clientY - startY;
    if (delta >= threshold) {
      options.onRefresh();
    }
    cleanup();
  }

  function handlePointerCancel() {
    cleanup();
  }

  node.addEventListener('pointerdown', handlePointerDown);
  node.addEventListener('pointermove', handlePointerMove);
  node.addEventListener('pointerup', handlePointerUp);
  node.addEventListener('pointercancel', handlePointerCancel);

  return {
    destroy() {
      node.removeEventListener('pointerdown', handlePointerDown);
      node.removeEventListener('pointermove', handlePointerMove);
      node.removeEventListener('pointerup', handlePointerUp);
      node.removeEventListener('pointercancel', handlePointerCancel);
      indicator?.remove();
    },
  };
}
