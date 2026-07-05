/**
 * Launch performance marks — production-safe (NOT gated behind import.meta.env.DEV).
 *
 * Source of truth: src/models/launch-performance.model.md
 *
 * Marks recorded (all times are ms relative to performance.timeOrigin):
 *   mp:shell        — First Contentful Paint of the static skeleton (phase 1)
 *   mp:css-ready    — sidepanel CSS responseEnd (phase 2)
 *   mp:app-mounted  — Svelte App mounted synchronously (phase 2)
 *   mp:page:<id>    — page chunk import resolved + component assignable (phase 3)
 *
 * Exposed on window.__mpPerf so a reproducible harness can read timings without
 * DEV mode. The surface is read-only and contains no user data.
 */

export type PageId = 'feed' | 'profile' | 'cv' | 'applications' | 'tjm' | 'settings' | 'onboarding';

export interface LaunchSnapshot {
  timeOrigin: number;
  now: number;
  shell: number | null;
  cssReady: number | null;
  appMounted: number | null;
  pages: Partial<Record<PageId, number>>;
  importStart: Partial<Record<PageId, number>>;
}

const GLOBAL_KEY = '__mpPerf' as const;

interface LaunchMarksState {
  shell: number | null;
  cssReady: number | null;
  cssSelectorResolved: boolean;
  pages: Partial<Record<PageId, number>>;
  importStart: Partial<Record<PageId, number>>;
}

const state: LaunchMarksState = {
  shell: null,
  cssReady: null,
  cssSelectorResolved: false,
  pages: {},
  importStart: {},
};

function readAppMounted(): number | null {
  const entries = performance.getEntriesByName('mp:app-mounted');
  return entries.length > 0 ? entries[0].startTime : null;
}

function observeShellPaint() {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          state.shell = entry.startTime;
        }
      }
    });
    obs.observe({ type: 'paint', buffered: true });
  } catch {
    // PerformanceObserver unsupported — shell stays null.
  }
}

function observeCssReady() {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        // The sidepanel CSS is the only render-blocking stylesheet in the document.
        if (
          !state.cssSelectorResolved &&
          resource.initiatorType === 'css' &&
          resource.name.includes('sidepanel')
        ) {
          state.cssReady = resource.responseEnd;
        }
      }
      if (state.cssReady !== null) {
        state.cssSelectorResolved = true;
      }
    });
    obs.observe({ type: 'resource', buffered: true });
  } catch {
    // PerformanceObserver unsupported — cssReady stays null.
  }
}

function getSnapshot(): LaunchSnapshot {
  return {
    timeOrigin: performance.timeOrigin,
    now: performance.now(),
    shell: state.shell,
    cssReady: state.cssReady,
    appMounted: readAppMounted(),
    pages: { ...state.pages },
    importStart: { ...state.importStart },
  };
}

function markAppMounted() {
  if (performance.getEntriesByName('mp:app-mounted').length === 0) {
    performance.mark('mp:app-mounted');
  }
}

function markImportStart(page: PageId) {
  if (state.importStart[page] === undefined) {
    state.importStart[page] = performance.now();
  }
}

function markPageLoaded(page: PageId) {
  if (state.pages[page] === undefined) {
    state.pages[page] = performance.now();
  }
}

function install() {
  if (typeof window === 'undefined') {
    return;
  }
  observeShellPaint();
  observeCssReady();
  (window as unknown as Record<string, unknown>)[GLOBAL_KEY] = { getSnapshot };
}

export const launchMarks = {
  install,
  markAppMounted,
  markImportStart,
  markPageLoaded,
  getSnapshot,
};
