// Polyfill IntersectionObserver pour jsdom (non disponible nativement)
class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(
    private callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit
  ) {}

  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver =
  IntersectionObserverMock as unknown as typeof IntersectionObserver;

// Polyfill Element.animate pour jsdom (Web Animations API non disponible)
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function (
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    _options?: number | KeyframeAnimationOptions
  ): Animation {
    return {
      cancel: () => {},
      finish: () => {},
      play: () => {},
      pause: () => {},
      reverse: () => {},
      persist: () => {},
      commitStyles: () => {},
      updatePlaybackRate: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      get finished() {
        return Promise.resolve(this as unknown as Animation);
      },
      get ready() {
        return Promise.resolve(this as unknown as Animation);
      },
      onfinish: null,
      oncancel: null,
      onremove: null,
      playState: 'finished',
      replaceState: 'active',
      playbackRate: 1,
      currentTime: null,
      startTime: null,
      effect: null,
      id: '',
      pending: false,
      timeline: null,
    } as unknown as Animation;
  };
}
