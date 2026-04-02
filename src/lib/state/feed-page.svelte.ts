/**
 * Feed Page State — Encapsulates all UI state for the FeedPage.
 *
 * Extracted from FeedPage.svelte to keep the component thin.
 * Manages: seen/favorites/hidden, sorting, filtering, search, keyboard shortcuts.
 *
 * Uses Svelte 5 runes for reactive state.
 */
import type { Mission, MissionSource, RemoteType } from '$lib/core/types/mission';
import type { FeedState } from './feed.svelte';
import type { FeedController, SourceStatus } from '$lib/shell/facades/feed-controller.svelte';
import type { AiAvailability } from '$lib/shell/ai/capabilities';
import type { PanelSide } from '$lib/shell/ui/panel-layout';
import {
  getSeenIds,
  saveSeenIds,
  getFavorites,
  saveFavorites,
  getHidden,
  saveHidden,
  getProfile,
  resetNewMissionCount,
  markAsSeen,
  toggleFavorite,
  toggleHidden,
  filterHidden,
  filterFavoritesOnly,
} from '$lib/shell/facades/feed-data.facade';
import { getPanelSide } from '$lib/shell/ui/panel-layout';
import { isPromptApiAvailable } from '$lib/shell/ai/capabilities';
import {
  registerShortcuts,
  FeedShortcuts,
  type ShortcutConfig,
} from '$lib/shell/utils/keyboard-shortcuts';
import { getConnectionStore } from '$lib/state/connection-singleton.svelte';

export type SortBy = 'score' | 'date' | 'tjm';

/**
 * Feed Page State — factory function returning a reactive state object.
 *
 * Exposes `$state` fields directly on the returned object so that
 * Svelte `bind:` directives work (they need a settable property).
 */
export function createFeedPageState(
  feedStore: {
    get state(): FeedState;
    get missions(): Mission[];
    get filteredMissions(): Mission[];
    get searchQuery(): string;
    get error(): string | null;
    load(): void;
    setMissions(missions: Mission[]): void;
    setError(msg: string): void;
    search(query: string): void;
    clearSearch(): void;
  },
  controller: FeedController,
) {
  // ============================================================
  // Mutable $state fields — accessible directly for bind:
  // ============================================================
  let sortBy = $state<SortBy>('score');

  // Restore persisted sortBy
  try {
    chrome.storage.local.get('feedSortBy').then((result) => {
      const stored = result.feedSortBy as string;
      if (stored === 'score' || stored === 'date' || stored === 'tjm') {
        sortBy = stored;
      }
    });
  } catch {
    // Outside extension context
  }
  let showFavoritesOnly = $state(false);
  let showHidden = $state(false);
  let showFilters = $state(false);
  let selectedStacks = $state<string[]>([]);
  let selectedSource = $state<MissionSource | null>(null);
  let selectedRemote = $state<RemoteType | null>(null);
  let firstName = $state('');
  let panelSide = $state<PanelSide>('right');
  let aiStatus = $state<AiAvailability>('no');
  let showShortcutsHelp = $state(false);
  const connection = getConnectionStore();
  let searchInputRef = $state<HTMLInputElement | null>(null);

  // Internal state (not directly bound)
  let seenIds = $state<string[]>([]);
  let favorites = $state<Record<string, number>>({});
  let hidden = $state<Record<string, number>>({});

  // Cleanup functions
  let cleanupFns: Array<() => void> = [];

  // ============================================================
  // Derived — from feed store
  // ============================================================
  let missions = $derived(feedStore.filteredMissions);
  let isLoading = $derived(feedStore.state === 'loading');
  let error = $derived(feedStore.error);
  let searchQuery = $derived(feedStore.searchQuery);
  let totalMissions = $derived(missions.length);

  // ============================================================
  // Derived — UI computations
  // ============================================================
  let seenSet = $derived(new Set(Array.isArray(seenIds) ? Array.from(seenIds) : []));

  let favoriteCount = $derived(Object.keys(favorites).length);
  let hiddenCount = $derived(Object.keys(hidden).length);
  let isOffline = $derived(connection.status === 'offline');
  let heroCompact = $derived(totalMissions > 0 && !isLoading);

  let filterActive = $derived(
    selectedSource !== null || selectedRemote !== null || selectedStacks.length > 0,
  );

  let availableStacks = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const m of missions) {
      for (const s of m.stack) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  });

  // Combined single-pass filter pipeline
  let displayMissions = $derived.by(() => {
    let result = missions ?? [];
    if (controller.enabledConnectorIds.size > 0) {
      result = result.filter((m) => controller.enabledConnectorIds.has(m.source));
    }
    if (showFavoritesOnly) {
      result = filterFavoritesOnly(result, favorites);
    }
    if (!showHidden) {
      result = filterHidden(result, hidden);
    }

    // Single-pass: source + remote + stacks
    if (selectedSource !== null || selectedRemote !== null || selectedStacks.length > 0) {
      const stacksSet = selectedStacks.length > 0 ? new Set(selectedStacks) : null;
      result = result.filter((m) => {
        if (selectedSource !== null && m.source !== selectedSource) return false;
        if (selectedRemote !== null && m.remote !== selectedRemote) return false;
        if (stacksSet && !m.stack.some((s) => stacksSet.has(s))) return false;
        return true;
      });
    }

    return result;
  });

  let visibleCount = $derived(displayMissions.length);

  // ============================================================
  // Event handlers
  // ============================================================

  function handleMissionSeen(missionId: string): void {
    const ids = Array.from(seenIds);
    if (ids.includes(missionId)) return;
    seenIds = markAsSeen(ids, [missionId]);
    saveSeenIds(Array.from(seenIds)).catch(() => {});
  }

  function handleToggleFavorite(id: string): void {
    favorites = toggleFavorite(favorites, id, Date.now());
    saveFavorites(favorites).catch(() => {});
  }

  function handleHide(id: string): void {
    hidden = toggleHidden(hidden, id, Date.now());
    saveHidden(hidden).catch(() => {});
  }

  function handleCopyLink(_id: string): void {
    // Copy handled in MissionCard, callback for future analytics
  }

  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const SEARCH_DEBOUNCE_MS = 300;

  function handleSearch(query: string): void {
    // Clear immediately when emptying
    if (!query) {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
      feedStore.clearSearch();
      return;
    }
    // Debounce non-empty queries
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      feedStore.search(query);
      searchDebounceTimer = null;
    }, SEARCH_DEBOUNCE_MS);
  }

  function toggleFavoritesFilter(): void {
    showFavoritesOnly = !showFavoritesOnly;
  }

  function toggleHiddenFilter(): void {
    showHidden = !showHidden;
  }

  function toggleStack(stack: string): void {
    if (selectedStacks.includes(stack)) {
      selectedStacks = selectedStacks.filter((s) => s !== stack);
    } else {
      selectedStacks = [...selectedStacks, stack];
    }
  }

  function setSelectedSource(source: MissionSource | null): void {
    selectedSource = source;
  }

  function setSelectedRemote(remote: RemoteType | null): void {
    selectedRemote = remote;
  }

  function clearAllFilters(): void {
    selectedStacks = [];
    selectedSource = null;
    selectedRemote = null;
  }

  // ============================================================
  // Setup — run effects on first call
  // ============================================================

  function setup(): void {
    // Load seen IDs
    $effect(() => {
      getSeenIds()
        .then((ids) => {
          seenIds = ids;
        })
        .catch(() => {});
    });

    // Load favorites & hidden
    $effect(() => {
      getFavorites()
        .then((f) => {
          favorites = f;
        })
        .catch(() => {});
      getHidden()
        .then((h) => {
          hidden = h;
        })
        .catch(() => {});
    });

    // Load profile for first name
    $effect(() => {
      getProfile()
        .then((p) => {
          if (p?.firstName) firstName = p.firstName;
        })
        .catch(() => {});
    });

    // Load panel side
    $effect(() => {
      getPanelSide().then((side) => {
        panelSide = side;
      });
    });

    // Load AI status
    $effect(() => {
      isPromptApiAvailable()
        .then((status) => {
          aiStatus = status;
        })
        .catch(() => {});
    });

    // Reset badge on mount
    $effect(() => {
      try {
        chrome.action.setBadgeText({ text: '' });
        resetNewMissionCount();
      } catch {
        // Outside extension context
      }
    });

    // Keyboard shortcuts
    $effect(() => {
      const shortcuts: Array<{ config: ShortcutConfig; handler: () => void }> = [
        {
          config: FeedShortcuts.REFRESH,
          handler: () => {
            if (!controller.isScanning && !isLoading && !isOffline) {
              controller.startScan();
            }
          },
        },
        {
          config: FeedShortcuts.TOGGLE_FAVORITES,
          handler: () => {
            toggleFavoritesFilter();
          },
        },
        {
          config: FeedShortcuts.TOGGLE_HIDDEN,
          handler: () => {
            toggleHiddenFilter();
          },
        },
        {
          config: FeedShortcuts.FOCUS_SEARCH,
          handler: () => {
            searchInputRef?.focus();
          },
        },
        {
          config: FeedShortcuts.CLEAR_SEARCH,
          handler: () => {
            if (searchQuery) {
              handleSearch('');
            } else if (showFilters) {
              showFilters = false;
            }
          },
        },
        {
          config: FeedShortcuts.SHOW_HELP,
          handler: () => {
            showShortcutsHelp = true;
          },
        },
      ];

      const unsubscribe = registerShortcuts(shortcuts);
      cleanupFns.push(unsubscribe);
      return unsubscribe;
    });

    // Dev event handlers
    if (import.meta.env.DEV) {
      $effect(() => {
        function handleMissions(e: Event) {
          const devMissions = (e as CustomEvent).detail;
          feedStore.setMissions(devMissions);
        }
        function handleDevState(e: Event) {
          const devState = (e as CustomEvent).detail as string;
          if (devState === 'empty') {
            feedStore.setMissions([]);
          } else if (devState === 'loading') {
            feedStore.load();
          } else if (devState === 'error') {
            feedStore.setError('[Dev] Simulated error');
          }
        }
        window.addEventListener('dev:missions', handleMissions);
        window.addEventListener('dev:feed-state', handleDevState);
        return () => {
          window.removeEventListener('dev:missions', handleMissions);
          window.removeEventListener('dev:feed-state', handleDevState);
        };
      });
    }

    // Cleanup controller on unmount
    $effect(() => {
      return () => controller.dispose();
    });

    // Dev logging
    if (import.meta.env.DEV) {
      $effect(() => {
        console.log(
          '[FeedPage] state:',
          feedStore.state,
          'missions:',
          missions?.length ?? 0,
          'displayMissions:',
          displayMissions.length,
          'visibleCount:',
          visibleCount,
        );
      });
    }
  }

  function dispose(): void {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    for (const fn of cleanupFns) {
      fn();
    }
    cleanupFns = [];
  }

  // ============================================================
  // Return — all $state fields are directly accessible for bind:
  // ============================================================

  return {
    // Mutable state — bindable by Svelte
    get sortBy() { return sortBy; },
    set sortBy(v: SortBy) {
      sortBy = v;
      try { chrome.storage.local.set({ feedSortBy: v }); } catch { /* outside ext */ }
    },

    get showFavoritesOnly() { return showFavoritesOnly; },
    get showHidden() { return showHidden; },
    get showFilters() { return showFilters; },
    get selectedStacks() { return selectedStacks; },
    get selectedSource() { return selectedSource; },
    get selectedRemote() { return selectedRemote; },
    get firstName() { return firstName; },
    get panelSide() { return panelSide; },
    get aiStatus() { return aiStatus; },

    get showShortcutsHelp() { return showShortcutsHelp; },
    set showShortcutsHelp(v: boolean) { showShortcutsHelp = v; },

    get searchInputRef() { return searchInputRef; },
    set searchInputRef(v: HTMLInputElement | null) { searchInputRef = v; },

    // Internal state (read-only from template, mutated via handlers)
    get seenIds() { return seenIds; },
    get favorites() { return favorites; },
    get hidden() { return hidden; },

    // Derived — from feed store
    get missions() { return missions; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    get searchQuery() { return searchQuery; },
    get totalMissions() { return totalMissions; },

    // Derived — UI
    get seenSet() { return seenSet; },
    get favoriteCount() { return favoriteCount; },
    get hiddenCount() { return hiddenCount; },
    get isOffline() { return isOffline; },
    get heroCompact() { return heroCompact; },
    get filterActive() { return filterActive; },
    get availableStacks() { return availableStacks; },
    get displayMissions() { return displayMissions; },
    get visibleCount() { return visibleCount; },

    // Setters for non-bind cases
    setShowFilters(v: boolean) { showFilters = v; },

    // Actions
    handleMissionSeen,
    handleToggleFavorite,
    handleHide,
    handleCopyLink,
    handleSearch,
    toggleFavoritesFilter,
    toggleHiddenFilter,
    toggleStack,
    setSelectedSource,
    setSelectedRemote,
    clearAllFilters,

    // Lifecycle
    setup,
    dispose,
  };
}
