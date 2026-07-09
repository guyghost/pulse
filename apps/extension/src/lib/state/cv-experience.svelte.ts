/**
 * CV experience feed + cross-platform sync store.
 *
 * Implements the three cooperating state machines defined in
 * `apps/extension/src/models/cv-experience-sync.model.md`:
 *   - Feed: loading / ready / error
 *   - Edit: idle / adding / editing / saving / deleting / error
 *   - Sync: idle / preparing / syncing / cancelled / synced / partial / error
 *
 * The store is the Imperative Shell: it owns async + side effects and delegates
 * all computation to pure helpers in `$lib/core/cv/experience-helpers`. The LLM
 * never decides a transition here — it only produces signals (imported drafts)
 * that the model merges via `mergeExperiences`.
 *
 * Svelte 5 runes only.
 */
import type { Experience } from '$lib/core/types/profile';
import {
  buildPlatformPayloads,
  normalizeExperience,
  recomputePositionIndex,
  type PlatformSyncTarget,
} from '$lib/core/cv/experience-helpers';

export type FeedStatus = 'loading' | 'ready' | 'error';
export type EditStatus = 'idle' | 'adding' | 'editing' | 'saving' | 'deleting' | 'error';
export type SyncStatus =
  'idle' | 'preparing' | 'syncing' | 'cancelled' | 'synced' | 'partial' | 'error';
export type PlatformSyncStatus =
  'pending' | 'copying' | 'done' | 'error' | 'auth-required' | 'blocked' | 'skipped';

export interface CvExperienceDeps {
  loadExperiences(): Promise<Experience[]>;
  /** Persist the full experiences list to the user profile. */
  saveExperiences(experiences: Experience[]): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  platforms: PlatformSyncTarget[];
  now(): number;
  generateId(): string;
}

export interface CvExperienceStore {
  // reactive snapshot
  readonly experiences: Experience[];
  readonly feedStatus: FeedStatus;
  readonly editStatus: EditStatus;
  readonly draft: Experience | null;
  readonly editingId: string | null;
  readonly syncStatus: SyncStatus;
  readonly platformStatuses: Map<string, PlatformSyncStatus>;
  readonly lastSyncedAt: number | null;
  readonly feedError: string | null;
  readonly editError: string | null;
  readonly syncError: string | null;
  readonly canSync: boolean;
  readonly isSyncing: boolean;
  // feed
  load(): void;
  reload(): void;
  applyProfileUpdate(experiences: Experience[]): void;
  // edit
  newExperience(): void;
  editExperience(id: string): void;
  cancelEdit(): void;
  saveExperience(draft: Experience): void;
  deleteExperience(id: string): void;
  // sync
  startSync(): void;
  cancelSync(): void;
}

const SYNC_COPY_DENIED = 'Coller le CV dans le presse-papiers a été refusé par le navigateur.';
const SYNC_EMPTY = 'Aucune expérience à synchroniser. Ajoutez-en au moins une.';

export function createCvExperienceStore(deps: CvExperienceDeps): CvExperienceStore {
  let experiences = $state<Experience[]>([]);
  let feedStatus = $state<FeedStatus>('loading');
  let editStatus = $state<EditStatus>('idle');
  let draft = $state<Experience | null>(null);
  let editingId = $state<string | null>(null);
  let syncStatus = $state<SyncStatus>('idle');
  let platformStatuses = $state<Map<string, PlatformSyncStatus>>(new Map());
  let lastSyncedAt = $state<number | null>(null);
  let feedError = $state<string | null>(null);
  let editError = $state<string | null>(null);
  let syncError = $state<string | null>(null);

  const canSync = $derived(experiences.length > 0 && !isSyncBusy(syncStatus));
  const isSyncing = $derived(syncStatus === 'preparing' || syncStatus === 'syncing');

  // Reads the live sync status without TS narrowing (cancelSync can mutate it
  // across an await boundary, which the compiler's control-flow cannot see).
  function readSyncStatus(): SyncStatus {
    return syncStatus;
  }

  function setPlatformStatus(id: string, status: PlatformSyncStatus): void {
    const next = new Map(platformStatuses);
    next.set(id, status);
    platformStatuses = next;
  }

  function resetPlatformStatuses(): void {
    const next = new Map<string, PlatformSyncStatus>();
    for (const target of deps.platforms) {
      next.set(target.id, 'pending');
    }
    platformStatuses = next;
  }

  // ── Feed machine ────────────────────────────────────────────────────────
  async function load(): Promise<void> {
    feedStatus = 'loading';
    feedError = null;
    try {
      const result = await deps.loadExperiences();
      experiences = recomputePositionIndex(result);
      feedStatus = 'ready';
    } catch (err) {
      feedError = errorMessage(err, 'Impossible de charger vos expériences.');
      feedStatus = 'error';
    }
  }

  function reload(): void {
    void load();
  }

  // ── Edit machine ────────────────────────────────────────────────────────
  function newExperience(): void {
    if (editStatus !== 'idle' && editStatus !== 'error') {
      return; // invariant 1: one edit session at a time
    }
    const now = deps.now();
    draft = normalizeExperience(
      {
        title: '',
        company: null,
        location: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        description: '',
        skills: [],
        source: 'manual',
        sourceExternalId: null,
        positionIndex: 0,
      },
      now,
      deps.generateId
    );
    editingId = null;
    editStatus = 'adding';
    editError = null;
  }

  function editExperience(id: string): void {
    if (editStatus !== 'idle' && editStatus !== 'error') {
      return; // invariant 1
    }
    const target = experiences.find((exp) => exp.id === id);
    if (!target) {
      return;
    }
    draft = { ...target, skills: [...target.skills] };
    editingId = id;
    editStatus = 'editing';
    editError = null;
  }

  function cancelEdit(): void {
    if (editStatus !== 'adding' && editStatus !== 'editing' && editStatus !== 'error') {
      return;
    }
    draft = null;
    editingId = null;
    editStatus = 'idle';
    editError = null;
  }

  async function saveExperience(draftInput: Experience): Promise<void> {
    if (editStatus !== 'adding' && editStatus !== 'editing' && editStatus !== 'error') {
      return; // invariant 2: no re-entrancy
    }
    const isNew = editingId === null;
    const normalized = normalizeExperience(
      { ...draftInput, id: draftInput.id || editingId || undefined },
      deps.now(),
      deps.generateId
    );
    draft = normalized;
    editStatus = 'saving';
    editError = null;
    try {
      const next = isNew
        ? [...experiences, normalized]
        : experiences.map((exp) => (exp.id === normalized.id ? normalized : exp));
      const recomputed = recomputePositionIndex(next);
      await deps.saveExperiences(recomputed);
      experiences = recomputed;
      draft = null;
      editingId = null;
      editStatus = 'idle';
      feedStatus = 'ready';
    } catch (err) {
      editError = errorMessage(err, 'Impossible d’enregistrer l’expérience.');
      editStatus = 'error';
    }
  }

  async function deleteExperience(id: string): Promise<void> {
    if (editStatus !== 'idle' && editStatus !== 'error') {
      return; // invariant 2
    }
    editingId = id;
    editStatus = 'deleting';
    editError = null;
    try {
      const next = recomputePositionIndex(experiences.filter((exp) => exp.id !== id));
      await deps.saveExperiences(next);
      experiences = next;
      editingId = null;
      editStatus = 'idle';
      feedStatus = 'ready';
    } catch (err) {
      editError = errorMessage(err, 'Impossible de supprimer l’expérience.');
      editStatus = 'error';
    }
  }

  // ── Sync machine ────────────────────────────────────────────────────────
  async function startSync(): Promise<void> {
    if (isSyncBusy(syncStatus)) {
      return; // already running
    }
    if (experiences.length === 0) {
      syncStatus = 'error';
      syncError = SYNC_EMPTY;
      resetPlatformStatuses();
      return;
    }
    syncStatus = 'preparing';
    syncError = null;
    resetPlatformStatuses();

    // Pure prepare in core.
    const payloads = buildPlatformPayloads(experiences, deps.platforms);
    const sample = payloads.values().next().value ?? '';

    // Global clipboard probe — fail fast if the browser denies write access.
    try {
      await deps.copyToClipboard(sample);
    } catch {
      for (const target of deps.platforms) {
        setPlatformStatus(target.id, 'error');
      }
      syncStatus = 'error';
      syncError = SYNC_COPY_DENIED;
      return;
    }

    // Cancellation may have landed during the clipboard probe.
    if (readSyncStatus() === 'cancelled') {
      for (const target of deps.platforms) {
        setPlatformStatus(target.id, 'skipped');
      }
      return;
    }

    syncStatus = 'syncing';

    let done = 0;
    let failed = 0;
    for (const target of deps.platforms) {
      if (readSyncStatus() === 'cancelled') {
        setPlatformStatus(target.id, 'skipped');
        continue;
      }
      setPlatformStatus(target.id, 'copying');
      try {
        // Payload is already on the clipboard from the global probe above.
        // Re-copying here would fail once the first opened tab steals focus
        // (no clipboardWrite permission; navigator.clipboard needs transient
        // activation), so we only open the profile URL and let the user paste.
        await deps.openUrl(target.profileUrl);
        setPlatformStatus(target.id, 'done');
        done += 1;
      } catch {
        setPlatformStatus(target.id, 'error');
        failed += 1;
      }
    }

    if (readSyncStatus() === 'cancelled') {
      // already cancelled; keep cancelled status
      return;
    }

    if (done === deps.platforms.length) {
      syncStatus = 'synced';
      lastSyncedAt = deps.now();
    } else if (done > 0) {
      syncStatus = 'partial';
      lastSyncedAt = deps.now();
    } else {
      syncStatus = 'error';
    }

    if (failed > 0 && done === 0) {
      syncError = 'La synchronisation a échoué sur toutes les plateformes.';
    }
  }

  function cancelSync(): void {
    if (syncStatus !== 'syncing' && syncStatus !== 'preparing') {
      return;
    }
    syncStatus = 'cancelled';
    // remaining platforms will be marked skipped by the loop
  }

  // ── PROFILE_UPDATED (external merge) ────────────────────────────────────
  function applyProfileUpdate(incoming: Experience[]): void {
    // invariant 3: dropped during in-flight save/delete/sync and active edit.
    if (
      editStatus === 'adding' ||
      editStatus === 'editing' ||
      editStatus === 'saving' ||
      editStatus === 'deleting' ||
      syncStatus === 'preparing' ||
      syncStatus === 'syncing'
    ) {
      return;
    }
    experiences = recomputePositionIndex(incoming);
    feedStatus = 'ready';
    feedError = null;
    editError = null;
    editStatus = 'idle';
    editingId = null;
    draft = null;
    // External update (e.g. LinkedIn import) invalidates prior sync state —
    // reset the sync machine so stale statuses/lastSyncedAt don't persist.
    syncStatus = 'idle';
    syncError = null;
    lastSyncedAt = null;
    platformStatuses = new Map();
  }

  return {
    get experiences() {
      return experiences;
    },
    get feedStatus() {
      return feedStatus;
    },
    get editStatus() {
      return editStatus;
    },
    get draft() {
      return draft;
    },
    get editingId() {
      return editingId;
    },
    get syncStatus() {
      return syncStatus;
    },
    get platformStatuses() {
      return platformStatuses;
    },
    get lastSyncedAt() {
      return lastSyncedAt;
    },
    get feedError() {
      return feedError;
    },
    get editError() {
      return editError;
    },
    get syncError() {
      return syncError;
    },
    get canSync() {
      return canSync;
    },
    get isSyncing() {
      return isSyncing;
    },
    load,
    reload,
    applyProfileUpdate,
    newExperience,
    editExperience,
    cancelEdit,
    saveExperience,
    deleteExperience,
    startSync,
    cancelSync,
  };
}

function isSyncBusy(status: SyncStatus): boolean {
  return status === 'preparing' || status === 'syncing';
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.length > 0) {
    return err.message;
  }
  return fallback;
}
