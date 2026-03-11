// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('ripple-keyframes')) {
  const style = document.createElement('style');
  style.id = 'ripple-keyframes';
  style.textContent = `@keyframes ripple-expand { to { transform: scale(1); opacity: 0; } }`;
  document.head.appendChild(style);
}

export function ripple(node: HTMLElement) {
  node.style.overflow = 'hidden';
  if (!node.style.position || node.style.position === 'static') {
    node.style.position = 'relative';
  }

  function handlePointerDown(e: PointerEvent) {
    const rect = node.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2;

    const span = document.createElement('span');
    span.style.cssText = `
      position: absolute; border-radius: 50%; pointer-events: none;
      width: ${size}px; height: ${size}px;
      left: ${x - size / 2}px; top: ${y - size / 2}px;
      background: rgba(255,255,255,0.2);
      transform: scale(0); opacity: 1;
      animation: ripple-expand 400ms ease-out forwards;
    `;
    node.appendChild(span);
    setTimeout(() => span.remove(), 450);
  }

  node.addEventListener('pointerdown', handlePointerDown);

  return {
    destroy() {
      node.removeEventListener('pointerdown', handlePointerDown);
    },
  };
}
