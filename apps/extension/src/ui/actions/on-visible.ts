export function onVisible(node: HTMLElement, callback: () => void) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          callback();
          observer.unobserve(node);
        }
      }
    },
    { threshold: 0.5 }
  );

  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
    },
  };
}
