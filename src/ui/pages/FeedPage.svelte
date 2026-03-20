<script lang="ts">
    import { createActor } from "xstate";
    import { feedMachine } from "../../machines/feed.machine";
    import { scanOrchestratorMachine, type ConnectorDeps } from "../../machines/scan.machine";
    import VirtualMissionFeed from "../organisms/VirtualMissionFeed.svelte";
    import { pullToRefresh } from "../actions/pull-to-refresh";
    import ScanProgress from "../organisms/ScanProgress.svelte";
    import ConnectorStatusList from "../molecules/ConnectorStatusList.svelte";
    import SearchInput from "../molecules/SearchInput.svelte";
    import Icon from "../atoms/Icon.svelte";
    import FilterBar from "../organisms/FilterBar.svelte";
    import KeyboardShortcutsHelp from "../molecules/KeyboardShortcutsHelp.svelte";
    import type { MissionSource, RemoteType } from "$lib/core/types/mission";
    import { getConnector, getConnectorsMeta, getConnectors, detectAllConnectorSessions } from "$lib/shell/connectors/index";
    import SourceHealthPanel, { type SourceStatus, type SourceSessionStatus } from "../organisms/SourceHealthPanel.svelte";
    import { getSeenIds, saveSeenIds } from "$lib/shell/storage/seen-missions";
    import { markAsSeen } from "$lib/core/seen/mark-seen";
    import {
        getFavorites,
        saveFavorites,
        getHidden,
        saveHidden,
    } from "$lib/shell/storage/favorites";
    import { getProfile, getMissions, saveMissions, saveConnectorStatuses, getConnectorStatuses } from "$lib/shell/storage/db";
    import { getSettings } from "$lib/shell/storage/chrome-storage";
    import { resetNewMissionCount } from "$lib/shell/storage/session-storage";
    import {
        toggleFavorite,
        toggleHidden,
        filterHidden,
        filterFavoritesOnly,
    } from "$lib/core/favorites/favorites";
    import { toPersistedStatus, type ConnectorStatus, type PersistedConnectorStatus } from "$lib/core/types/connector-status";
    import { deduplicateMissions } from "$lib/core/scoring/dedup";
    import { scoreMission } from "$lib/core/scoring/relevance";
    import { getPanelSide, type PanelSide } from "$lib/shell/ui/panel-layout";
    import {
        isPromptApiAvailable,
        type AiAvailability,
    } from "$lib/shell/ai/capabilities";
    import {
        registerShortcut,
        registerShortcuts,
        FeedShortcuts,
        type ShortcutConfig,
    } from "$lib/shell/utils/keyboard-shortcuts";
    import { subscribeToConnection, isOnline, type ConnectionInfo } from "$lib/shell/utils/connection-monitor";

    const feedActor = createActor(feedMachine);
    feedActor.start();

    let feedSnapshot = $state(feedActor.getSnapshot());

    // Subscribe synchronously so every event (including those from smartLoad)
    // is captured BEFORE the first render. Using $effect would defer the
    // subscription until after the first paint, creating a window where
    // MISSIONS_LOADED and LOAD events update the actor but feedSnapshot stays stale.
    const _feedSub = feedActor.subscribe((s) => {
        feedSnapshot = s;
    });

    $effect(() => {
        return () => _feedSub.unsubscribe();
    });

    let missions = $derived(feedSnapshot.context.filteredMissions);
    let isLoading = $derived(feedSnapshot.matches("loading"));
    let error = $derived(feedSnapshot.context.error);
    let searchQuery = $derived(feedSnapshot.context.searchQuery);
    let totalMissions = $derived(missions.length);

    let displayMissions = $derived.by(() => {
        let result = missions;
        if (showFavoritesOnly) {
            result = filterFavoritesOnly(result, favorites);
        }
        if (!showHidden) {
            result = filterHidden(result, hidden);
        }
        if (selectedSource) {
            result = result.filter((m) => m.source === selectedSource);
        }
        if (selectedRemote) {
            result = result.filter((m) => m.remote === selectedRemote);
        }
        if (selectedStacks.length > 0) {
            result = result.filter((m) =>
                selectedStacks.some((s) => m.stack.includes(s)),
            );
        }
        return result;
    });

    let seenIds = $state<string[]>([]);
    let favorites = $state<Record<string, number>>({});
    let hidden = $state<Record<string, number>>({});
    let sortBy = $state<"score" | "date" | "tjm">("score");
    let showFavoritesOnly = $state(false);
    let showHidden = $state(false);
    let showFilters = $state(false);
    let selectedStacks = $state<string[]>([]);
    let selectedSource = $state<MissionSource | null>(null);
    let selectedRemote = $state<RemoteType | null>(null);
    let favoriteCount = $derived(Object.keys(favorites).length);
    let hiddenCount = $derived(Object.keys(hidden).length);
    let visibleCount = $derived(displayMissions.length);
    let filterActive = $derived(
        selectedSource !== null ||
            selectedRemote !== null ||
            selectedStacks.length > 0,
    );
    let availableStacks = $derived.by(() => {
        const counts = new Map<string, number>();
        for (const m of missions) {
            for (const s of m.stack) {
                counts.set(s, (counts.get(s) ?? 0) + 1);
            }
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name);
    });
    let firstName = $state("");
    let panelSide = $state<PanelSide>("right");
    let aiStatus = $state<AiAvailability>("no");
    let scanActor = $state<ReturnType<typeof createActor<typeof scanOrchestratorMachine>> | null>(null);
    let connectorStatuses = $state<Map<string, ConnectorStatus>>(new Map());
    let persistedStatuses = $state<PersistedConnectorStatus[]>([]);
    let sourceStatuses = $state<SourceStatus[]>([]);
    let isCheckingSources = $state(false);
    let scanCompleted = $state(false);
    let scanResultCounts = $state<Map<string, number>>(new Map());

    let scanProgress = $derived.by(() => {
        if (connectorStatuses.size === 0) return { current: 0, total: 0, percent: 0, connectorName: '' };
        const statuses = [...connectorStatuses.values()];
        const total = statuses.length;
        const completed = statuses.filter((s) => s.state === 'done' || s.state === 'error').length;
        const active = statuses.find((s) => s.state === 'detecting' || s.state === 'fetching' || s.state === 'retrying');
        return {
            current: completed,
            total,
            percent: total > 0 ? Math.round((completed / total) * 100) : 0,
            connectorName: active?.connectorName ?? '',
        };
    });
    let showShortcutsHelp = $state(false);
    let searchInputRef = $state<HTMLInputElement | null>(null);
    let connectionStatus = $state<ConnectionInfo['status']>('unknown');
    let isOffline = $derived(connectionStatus === 'offline');

    $effect(() => {
        getSeenIds()
            .then((ids) => {
                seenIds = ids;
            })
            .catch(() => {});
    });

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

    $effect(() => {
        getProfile()
            .then((p) => {
                if (p?.firstName) firstName = p.firstName;
            })
            .catch(() => {});
    });

    $effect(() => {
        getPanelSide().then((side) => {
            panelSide = side;
        });
    });

    $effect(() => {
        isPromptApiAvailable()
            .then((status) => {
                aiStatus = status;
            })
            .catch(() => {});
    });

    $effect(() => {
        try {
            chrome.action.setBadgeText({ text: "" });
            resetNewMissionCount();
        } catch {
            // Outside extension context
        }
    });

    // Abonnement à l'état de connexion
    $effect(() => {
        const unsubscribe = subscribeToConnection((info) => {
            connectionStatus = info.status;
        });
        return unsubscribe;
    });

    // Charger les statuts persistés au montage
    $effect(() => {
        getConnectorStatuses().then((s) => { persistedStatuses = s; }).catch(() => {});
    });

    // Keyboard shortcuts registration
    $effect(() => {
        const shortcuts: Array<{ config: ShortcutConfig; handler: () => void }> = [
            {
                config: FeedShortcuts.REFRESH,
                handler: () => {
                    if (!isLoading && !isOffline) {
                        startScan();
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
        return unsubscribe;
    });

    function handleMissionSeen(missionId: string) {
        if (seenIds.includes(missionId)) return;
        seenIds = markAsSeen(seenIds, [missionId]);
        saveSeenIds(seenIds).catch(() => {});
    }

    function handleToggleFavorite(id: string) {
        favorites = toggleFavorite(favorites, id, Date.now());
        saveFavorites(favorites).catch(() => {});
    }

    function handleHide(id: string) {
        hidden = toggleHidden(hidden, id, Date.now());
        saveHidden(hidden).catch(() => {});
    }

    function handleCopyLink(_id: string) {
        // Copy handled in MissionCard, callback for future analytics
    }

    function toggleFavoritesFilter() {
        showFavoritesOnly = !showFavoritesOnly;
    }

    function toggleHiddenFilter() {
        showHidden = !showHidden;
    }

    function handleSearch(query: string) {
        if (query) {
            feedActor.send({ type: "SEARCH", query });
        } else {
            feedActor.send({ type: "CLEAR_SEARCH" });
        }
    }

    async function startScan() {
        if (isLoading) return;
        scanCompleted = false;
        feedActor.send({ type: "LOAD" });

        const settings = await getSettings();
        const enabledIds = settings.enabledConnectors;
        const meta = getConnectorsMeta();

        // Build connector deps
        const deps: ConnectorDeps[] = [];
        for (const id of enabledIds) {
            const connector = await getConnector(id);
            if (!connector) continue;
            const m = meta.find((x) => x.id === id);
            deps.push({
                connectorId: connector.id,
                connectorName: m?.name ?? connector.name,
                detectSession: (now: number) => connector.detectSession(now),
                fetchMissions: (now: number) => connector.fetchMissions(now),
            });
        }

        const actor = createActor(scanOrchestratorMachine, {
            input: { connectorDeps: deps, isOnline },
        });

        const sub = actor.subscribe((s) => {
            connectorStatuses = new Map(s.context.connectorStatuses);

            if (s.value === 'done') {
                handleScanDone(s.context);
                sub.unsubscribe();
                scanActor = null;
            }

            if (s.value === 'cancelled') {
                feedActor.send({ type: "MISSIONS_LOADED", missions: feedSnapshot.context.missions });
                sub.unsubscribe();
                scanActor = null;
            }
        });

        scanActor = actor;
        actor.start();
        actor.send({ type: 'START_SCAN' });
    }

    async function handleScanDone(ctx: { missions: import('$lib/core/types/mission').Mission[]; connectorStatuses: Map<string, ConnectorStatus>; globalError: string | null }) {
        // Extract mission counts per source for compact display
        const counts = new Map<string, number>();
        for (const [id, status] of ctx.connectorStatuses) {
            counts.set(id, status.missionsCount);
        }
        scanResultCounts = counts;
        scanCompleted = true;
        if (ctx.globalError) {
            feedActor.send({ type: "LOAD_ERROR", error: ctx.globalError });
            return;
        }

        // Fusionner nouvelles missions + cache pour resilience (scan partiel)
        let cached: import('$lib/core/types/mission').Mission[] = [];
        try { cached = await getMissions(); } catch {}
        const merged = [...ctx.missions, ...cached];
        const deduped = deduplicateMissions(merged);

        let profile = null;
        try { profile = await getProfile(); } catch {}
        const scored = profile
            ? deduped.map((m) => ({ ...m, score: scoreMission(m, profile!) }))
            : deduped;

        if (scored.length > 0) {
            feedActor.send({ type: "MISSIONS_LOADED", missions: scored });
            try { await saveMissions(scored); } catch {}
            try { await chrome.storage.local.set({ lastGlobalSync: Date.now() }); } catch {}
        } else {
            const errorMsg = [...ctx.connectorStatuses.values()]
                .filter((s) => s.error)
                .map((s) => `${s.connectorName}: ${s.error!.message}`)
                .join("\n");
            feedActor.send({ type: "LOAD_ERROR", error: errorMsg || "Aucune mission trouvee" });
        }

        // Persist connector statuses
        const persisted = [...ctx.connectorStatuses.values()].map((s) => toPersistedStatus(s, Date.now()));
        try {
            await saveConnectorStatuses(persisted);
            persistedStatuses = persisted;
        } catch {}
    }

    function stopScan() {
        if (scanActor) {
            scanActor.send({ type: 'CANCEL' });
        }
    }

    async function checkSourceSessions() {
        if (isCheckingSources) return;
        isCheckingSources = true;

        try {
            const settings = await getSettings();
            const enabledIds = settings.enabledConnectors;
            const meta = getConnectorsMeta();
            const now = Date.now();

            // Build initial source statuses with "checking" state
            sourceStatuses = enabledIds.map((id) => {
                const m = meta.find((x) => x.id === id);
                return {
                    connectorId: id,
                    name: m?.name ?? id,
                    icon: m?.icon ?? '',
                    url: m?.url ?? '',
                    sessionStatus: 'checking' as SourceSessionStatus,
                    lastSyncAt: null,
                };
            });

            // Load connectors and detect sessions in parallel
            const connectors = await getConnectors(enabledIds);
            const results = await detectAllConnectorSessions(connectors, now);

            // Load last sync times in parallel
            const lastSyncResults = await Promise.all(
                connectors.map(async (c) => {
                    const result = await c.getLastSync(now);
                    return {
                        id: c.id,
                        lastSyncAt: result.ok ? result.value : null,
                    };
                })
            );

            // Merge results into source statuses
            const lastSyncMap = new Map(lastSyncResults.map((r) => [r.id, r.lastSyncAt]));
            const resultMap = new Map(results.map((r) => [r.connectorId, r]));

            sourceStatuses = sourceStatuses.map((s) => {
                const result = resultMap.get(s.connectorId);
                const lastSync = lastSyncMap.get(s.connectorId);

                let sessionStatus: SourceSessionStatus = 'checking';
                if (result) {
                    if (result.error) {
                        sessionStatus = 'error';
                    } else if (result.hasSession) {
                        sessionStatus = 'connected';
                    } else {
                        sessionStatus = 'not-connected';
                    }
                }

                return {
                    ...s,
                    sessionStatus,
                    lastSyncAt: lastSync?.getTime() ?? null,
                    error: result?.error,
                };
            });
        } catch {
            // Outside extension context or connector load failed
            sourceStatuses = sourceStatuses.map((s) => ({
                ...s,
                sessionStatus: 'error' as SourceSessionStatus,
            }));
        } finally {
            isCheckingSources = false;
        }
    }

    // Check source sessions on mount (only when not auto-scanning)
    $effect(() => {
        checkSourceSessions();
    });

    // Smart load: use persisted data if fresh, scan only if stale
    async function smartLoad() {
        try {
            const [stored, settings] = await Promise.all([
                getMissions(),
                getSettings(),
            ]);
            if (stored.length > 0) {
                feedActor.send({ type: "MISSIONS_LOADED", missions: stored });
                const result = await chrome.storage.local.get("lastGlobalSync");
                const lastSync = result.lastGlobalSync as number | undefined;
                const intervalMs = settings.scanIntervalMinutes * 60 * 1000;
                if (lastSync && Date.now() - lastSync < intervalMs) return;
            }
            startScan();
        } catch {
            startScan();
        }
    }
    smartLoad();

    // Listen for background scan results from service worker
    try {
        const handleBgScan = (message: any) => {
            if (
                message?.type === "SCAN_COMPLETE" &&
                Array.isArray(message.payload)
            ) {
                feedActor.send({
                    type: "MISSIONS_LOADED",
                    missions: message.payload,
                });
            }
        };
        chrome.runtime.onMessage.addListener(handleBgScan);
    } catch {
        // Outside extension context
    }

    if (import.meta.env.DEV) {
        $effect(() => {
            function handleMissions(e: Event) {
                const missions = (e as CustomEvent).detail;
                feedActor.send({ type: "MISSIONS_LOADED", missions });
            }
            function handleState(e: Event) {
                const state = (e as CustomEvent).detail as string;
                if (state === "empty") {
                    feedActor.send({ type: "MISSIONS_LOADED", missions: [] });
                } else if (state === "loading") {
                    feedActor.send({ type: "LOAD" });
                } else if (state === "error") {
                    feedActor.send({
                        type: "LOAD_ERROR",
                        error: "[Dev] Simulated error",
                    });
                }
            }
            window.addEventListener("dev:missions", handleMissions);
            window.addEventListener("dev:feed-state", handleState);
            return () => {
                window.removeEventListener("dev:missions", handleMissions);
                window.removeEventListener("dev:feed-state", handleState);
            };
        });
    }
</script>

<div class="relative flex h-full flex-col">
    <div class="shrink-0 px-4 pt-4">
        <section
            class="section-card-strong relative overflow-hidden rounded-[1.75rem] px-4 py-4"
        >
            <div
                class="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-accent-blue/14 blur-3xl"
            ></div>
            <div
                class="pointer-events-none absolute bottom-0 left-10 h-20 w-20 rounded-full bg-accent-emerald/10 blur-2xl"
            ></div>
            <div class="relative">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="eyebrow text-accent-blue/80">MissionPulse</p>
                        <h2
                            class="mt-2 text-[1.65rem] font-semibold leading-none text-white"
                        >
                            {firstName
                                ? `Bonjour, ${firstName}`
                                : "Radar freelance"}
                        </h2>
                        <p
                            class="mt-3 max-w-80 text-sm leading-relaxed text-text-secondary"
                        >
                            Surveille les pistes utiles, filtre le bruit et
                            garde les meilleures missions a portee de main.
                        </p>
                    </div>
                    <div
                        class="flex items-center gap-2"
                        class:flex-row-reverse={panelSide === "left"}
                    >
                        {#if isLoading}
                            <button
                                class="soft-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-400 transition-all duration-200 hover:bg-red-500/20 hover:text-red-300"
                                onclick={stopScan}
                                title="Stopper le scan"
                            >
                                <Icon name="square" size={14} />
                            </button>
                        {/if}
                        <button
                            class="soft-ring relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200
                {isLoading
                                ? 'border-accent-blue/30 bg-accent-blue/10'
                                : isOffline
                                    ? 'border-white/5 bg-white/3 text-text-muted cursor-not-allowed'
                                    : 'border-white/10 bg-white/6 text-white hover:bg-white/10'}"
                            onclick={startScan}
                            disabled={isLoading || isOffline}
                            title={isLoading
                                ? "Scan en cours..."
                                : isOffline
                                    ? "Scan indisponible hors ligne"
                                    : "Lancer le scan (r)"}
                        >
                            {#if isLoading}
                                <span
                                    class="absolute inset-0 flex items-center justify-center"
                                >
                                    <span
                                        class="radar-ping absolute h-8 w-8 rounded-full border border-accent-blue/40"
                                    ></span>
                                    <span
                                        class="radar-ping animation-delay-500 absolute h-5 w-5 rounded-full border border-accent-blue/60"
                                    ></span>
                                    <span
                                        class="h-2 w-2 rounded-full bg-accent-blue"
                                    ></span>
                                </span>
                            {:else}
                                <Icon name="play" size={14} class="ml-0.5" />
                            {/if}
                        </button>
                    </div>
                </div>

                <ScanProgress
                    isScanning={isLoading}
                    progress={scanProgress.percent}
                    missionsFound={totalMissions}
                    connectorName={scanProgress.connectorName}
                    current={scanProgress.current}
                    total={scanProgress.total}
                />

                <ConnectorStatusList
                    statuses={connectorStatuses}
                    {persistedStatuses}
                    isScanning={isLoading}
                />

                {#if !isLoading}
                    <SourceHealthPanel
                        sources={sourceStatuses}
                        isChecking={isCheckingSources}
                        compact={scanCompleted}
                        {scanResultCounts}
                        onRefresh={checkSourceSessions}
                    />
                {/if}

                {#if isOffline}
                    <div class="mt-3 flex items-center gap-2 rounded-xl border border-accent-amber/20 bg-accent-amber/5 px-3 py-2 text-xs text-accent-amber">
                        <Icon name="database" size={14} />
                        <span>Mode hors ligne — Données en cache</span>
                    </div>
                {/if}
                
                <div class="mt-4 grid grid-cols-3 gap-2">
                    <div
                        class="rounded-[1.25rem] border border-white/8 bg-white/5 px-3 py-3"
                    >
                        <p
                            class="text-[11px] uppercase tracking-[0.18em] text-text-muted"
                        >
                            Visibles
                        </p>
                        <p class="mt-2 text-xl font-semibold text-white">
                            {visibleCount}
                        </p>
                    </div>
                    <div
                        class="rounded-[1.25rem] border border-white/8 bg-white/4 px-3 py-3"
                    >
                        <p
                            class="text-[11px] uppercase tracking-[0.18em] text-text-muted"
                        >
                            Favoris
                        </p>
                        <p class="mt-2 text-xl font-semibold text-accent-amber">
                            {favoriteCount}
                        </p>
                    </div>
                    <div
                        class="rounded-[1.25rem] border border-white/8 bg-white/4 px-3 py-3"
                    >
                        <p
                            class="text-[11px] uppercase tracking-[0.18em] text-text-muted"
                        >
                            Masquees
                        </p>
                        <p class="mt-2 text-xl font-semibold text-text-primary">
                            {hiddenCount}
                        </p>
                    </div>
                </div>
                {#if aiStatus === "after-download"}
                    <p class="mt-2 text-center text-[11px] text-text-muted">
                        Scoring IA en telechargement...
                    </p>
                {:else if aiStatus === "no"}
                    <p class="mt-2 text-center text-[11px] text-text-muted">
                        Scoring IA indisponible
                    </p>
                {/if}
            </div>
        </section>

        <section
            class="section-card relative overflow-hidden mt-4 rounded-[1.4rem] p-3"
            aria-label="Missions triees"
        >
            <div
                class="pointer-events-none absolute -left-4 top-0 h-24 w-24 rounded-full bg-accent-emerald/8 blur-2xl"
            ></div>

            <div
                class="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {#if isLoading}Chargement des missions en cours{/if}
            </div>

            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <h3
                        class="text-sm font-semibold tracking-tight text-white"
                    >
                        Missions triees
                    </h3>
                    {#if !isLoading}
                        <span
                            class="inline-flex items-center gap-1.5 rounded-full border border-accent-emerald/15 bg-accent-emerald/8 px-2 py-0.5 text-[10px] font-medium text-accent-emerald/90"
                            aria-label="{visibleCount} missions visibles"
                        >
                            <span
                                class="h-1.5 w-1.5 rounded-full bg-accent-emerald"
                            ></span>
                            {visibleCount}
                        </span>
                    {/if}
                </div>
                {#if isLoading}
                    <span
                        class="flex items-center gap-2 text-xs text-text-muted"
                        aria-hidden="true"
                    >
                        <span
                            class="h-3 w-3 animate-spin rounded-full border-2 border-accent-blue/30 border-t-accent-blue"
                        ></span>
                        Scraping...
                    </span>
                {/if}
            </div>

            <div class="mt-2">
                <SearchInput 
                    value={searchQuery} 
                    onSearch={handleSearch}
                    bind:inputRef={searchInputRef}
                />
            </div>

            <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <div class="flex items-center gap-1.5">
                    <button
                        class="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-200
              {showFavoritesOnly
                            ? 'border-accent-amber/35 bg-accent-amber/15 text-accent-amber shadow-glow-amber'
                            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
                        onclick={toggleFavoritesFilter}
                        aria-pressed={showFavoritesOnly}
                        title={showFavoritesOnly
                            ? "Voir toutes (f)"
                            : "Voir favoris (f)"}
                    >
                        <Icon
                            name="star"
                            size={13}
                            class={showFavoritesOnly ? "fill-accent-amber" : ""}
                        />
                        Favoris
                        {#if favoriteCount > 0}
                            <span
                                class="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium"
                                >{favoriteCount}</span
                            >
                        {/if}
                    </button>
                    <button
                        class="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-200
              {showHidden
                            ? 'border-accent-blue/35 bg-accent-blue/15 text-accent-blue shadow-glow-blue'
                            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
                        onclick={toggleHiddenFilter}
                        aria-pressed={showHidden}
                        title={showHidden
                            ? "Masquer les ignorees (h)"
                            : "Voir ignorees (h)"}
                    >
                        <Icon name={showHidden ? "eye" : "eye-off"} size={13} />
                        Ignorees
                        {#if hiddenCount > 0}
                            <span
                                class="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium"
                                >{hiddenCount}</span
                            >
                        {/if}
                    </button>
                </div>

                <div
                    class="h-5 w-px bg-linear-to-b from-transparent via-white/15 to-transparent"
                ></div>

                <div class="flex items-center gap-1.5">
                    <label class="sr-only" for="sort-select">Trier par</label>
                    <select
                        id="sort-select"
                        class="min-h-9 cursor-pointer rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-[11px] text-text-secondary outline-none transition-colors focus:border-accent-blue/40 focus:bg-white/6"
                        bind:value={sortBy}
                    >
                        <option value="score">Pertinence</option>
                        <option value="date">Date</option>
                        <option value="tjm">TJM</option>
                    </select>
                    <button
                        class="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-200
              {showFilters || filterActive
                            ? 'border-accent-blue/35 bg-accent-blue/15 text-accent-blue shadow-glow-blue'
                            : 'border-white/8 bg-white/4 text-text-secondary hover:bg-white/8 hover:text-white'}"
                        onclick={() => (showFilters = !showFilters)}
                        aria-expanded={showFilters}
                        aria-controls="filter-panel"
                        title={showFilters
                            ? "Masquer les filtres"
                            : "Afficher les filtres"}
                    >
                        <Icon name="sliders-horizontal" size={13} />
                        Filtres
                        {#if filterActive}
                            <span
                                class="h-2 w-2 rounded-full bg-accent-blue shadow-glow-blue"
                            ></span>
                        {/if}
                    </button>
                    <button
                        class="soft-ring inline-flex min-h-9 items-center justify-center rounded-full border border-white/8 bg-white/4 px-2.5 py-1.5 text-text-secondary transition-all duration-200 hover:bg-white/8 hover:text-white"
                        onclick={() => showShortcutsHelp = true}
                        title="Raccourcis clavier (?)"
                        aria-label="Afficher l'aide des raccourcis clavier"
                    >
                        <Icon name="help-circle" size={14} />
                    </button>
                </div>
            </div>

            {#if showFilters}
                <div
                    id="filter-panel"
                    class="mt-3 border-t border-white/8 pt-3"
                    role="group"
                    aria-label="Options de filtrage"
                >
                    <FilterBar
                        {availableStacks}
                        {selectedStacks}
                        {selectedSource}
                        {selectedRemote}
                        onToggleStack={(stack) => {
                            if (selectedStacks.includes(stack)) {
                                selectedStacks = selectedStacks.filter(
                                    (s) => s !== stack,
                                );
                            } else {
                                selectedStacks = [...selectedStacks, stack];
                            }
                        }}
                        onSetSource={(source) => {
                            selectedSource = source;
                        }}
                        onSetRemote={(remote) => {
                            selectedRemote = remote;
                        }}
                        onClearAll={() => {
                            selectedStacks = [];
                            selectedSource = null;
                            selectedRemote = null;
                        }}
                    />
                </div>
            {/if}
        </section>
    </div>

    <div
        class="flex-1 overflow-y-auto px-4 pb-5 pt-4"
        use:pullToRefresh={{ onRefresh: () => startScan(), threshold: 60 }}
    >
        <VirtualMissionFeed
            missions={displayMissions}
            {isLoading}
            {error}
            {seenIds}
            {favorites}
            {hidden}
            {sortBy}
            {filterActive}
            onMissionSeen={handleMissionSeen}
            onToggleFavorite={handleToggleFavorite}
            onHide={handleHide}
            onCopyLink={handleCopyLink}
        />
        {#if hiddenCount > 0 && !showFavoritesOnly}
            <button
                class="mt-3 w-full rounded-full border border-white/8 bg-white/4 py-3 text-xs text-text-secondary transition-all duration-200 hover:border-white/12 hover:bg-white/8 hover:text-white"
                onclick={toggleHiddenFilter}
                aria-pressed={showHidden}
            >
                {showHidden
                    ? "Masquer les ignorees"
                    : `Voir les ${hiddenCount} mission${hiddenCount > 1 ? "s" : ""} masquee${hiddenCount > 1 ? "s" : ""}`}
            </button>
        {/if}
    </div>
</div>

<KeyboardShortcutsHelp bind:isOpen={showShortcutsHelp} />
