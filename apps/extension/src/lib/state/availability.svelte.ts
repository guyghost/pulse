/**
 * Availability editor + cross-platform push store.
 *
 * Implements the two cooperating state machines defined in
 * `apps/extension/src/models/availability-sync.model.md`:
 *   - Load/Edit: loading / idle / editing / saving / error
 *   - Push:      idle / preparing / pushing / cancelled / pushed / partial / error
 *
 * The store is the Imperative Shell: it owns async + side effects and delegates
 * all computation to pure helpers in `$lib/core/availability/availability-helpers`.
 *
 * Availability is a single record on the user profile (not a list), so the
 * editor is simpler than the CV experience editor: one draft, no position
 * index, no delete (clearing = saving a normalized draft with status kept and
 * empty note, or simply not pushing).
 *
 * Svelte 5 runes only.
 */
import type { Availability, AvailabilityStatus } from '$lib/core/types/availability';
import {
  blankAvailabilityDraft,
  buildAvailabilityPayloads,
  normalizeAvailability,
  type PlatformSyncTarget,
} from '$lib/core/availability/availability-helpers';

export type LoadStatus = 'loading' | 'idle' | 'error';
export type EditStatus = 'idle' | 'editing' | 'saving' | 'error';
export type PushStatus =
  'idle' | 'preparing' | 'pushing' | 'cancelled' | 'pushed' | 'partial' | 'error';
export type PlatformPushStatus = 'pending' | 'copying' | 'done' | 'error' | 'skipped';

export interface AvailabilityDeps {
  loadAvailability(): Promise<Availability | null>;
  /** Persist the availability record (or `null` to clear) to the user profile. */
  saveAvailability(availability: Availability | null): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  platforms: PlatformSyncTarget[];
  now(): number;
}

export interface AvailabilityStore {
  // reactive snapshot
  readonly availability: Availability | null;
  readonly loadStatus: LoadStatus;
  readonly editStatus: EditStatus;
  readonly draft: Availability | null;
  readonly pushStatus: PushStatus;
  readonly platformStatuses: Map<string, PlatformPushStatus>;
  readonly lastPushedAt: number | null;
  readonly loadError: string | null;
  readonly editError: string | null;
  readonly pushError: string | null;
  readonly canPush: boolean;
  readonly isPushing: boolean;
  // load/edit
  load(): void;
  reload(): void;
  startEdit(): void;
  cancelEdit(): void;
  saveDraft(status: AvailabilityStatus, date: string | null, note: string): void;
  applyProfileUpdate(availability: Availability | null): void;
  // push
  startPush(): void;
  cancelPush(): void;
}

const PUSH_COPY_DENIED =
  'Copier la disponibilité dans le presse-papiers a été refusé par le navigateur.';

export function createAvailabilityStore(deps: AvailabilityDeps): AvailabilityStore {
  let availability = $state<Availability | null>(null);
  let loadStatus = $state<LoadStatus>('loading');
  let editStatus = $state<EditStatus>('idle');
  let draft = $state<Availability | null>(null);
  let pushStatus = $state<PushStatus>('idle');
  let platformStatuses = $state<Map<string, PlatformPushStatus>>(new Map());
  let lastPushedAt = $state<number | null>(null);
  let loadError = $state<string | null>(null);
  let editError = $state<string | null>(null);
  let pushError = $state<string | null>(null);

  // Matches model invariant: canPush requires a committed availability, no
  // in-flight save, and no busy push.
  const canPush = $derived(
    availability !== null && editStatus !== 'saving' && !isPushBusy(pushStatus)
  );
  const isPushing = $derived(pushStatus === 'preparing' || pushStatus === 'pushing');

  function readPushStatus(): PushStatus {
    return pushStatus;
  }

  function setPlatformStatus(id: string, status: PlatformPushStatus): void {
    const next = new Map(platformStatuses);
    next.set(id, status);
    platformStatuses = next;
  }

  function resetPlatformStatuses(): void {
    const next = new Map<string, PlatformPushStatus>();
    for (const target of deps.platforms) {
      next.set(target.id, 'pending');
    }
    platformStatuses = next;
  }

  // ── Load/Edit machine ──────────────────────────────────────────────────
  async function load(): Promise<void> {
    loadStatus = 'loading';
    loadError = null;
    try {
      availability = await deps.loadAvailability();
      loadStatus = 'idle';
    } catch (err) {
      loadError = errorMessage(err, 'Impossible de charger votre disponibilité.');
      loadStatus = 'error';
    }
  }

  function reload(): void {
    void load();
  }

  function startEdit(): void {
    if (editStatus !== 'idle' && editStatus !== 'error') {
      return; // invariant: one edit session at a time
    }
    draft = availability ? { ...availability } : blankAvailabilityDraft();
    editStatus = 'editing';
    editError = null;
  }

  function cancelEdit(): void {
    if (editStatus !== 'editing' && editStatus !== 'error') {
      return;
    }
    draft = null;
    editStatus = 'idle';
    editError = null;
  }

  async function saveDraft(
    status: AvailabilityStatus,
    date: string | null,
    note: string
  ): Promise<void> {
    if (editStatus !== 'editing' && editStatus !== 'error') {
      return; // invariant: no re-entrancy
    }
    const normalized = normalizeAvailability({ status, date, note }, deps.now());
    draft = normalized;
    editStatus = 'saving';
    editError = null;
    try {
      await deps.saveAvailability(normalized);
      availability = normalized;
      draft = null;
      editStatus = 'idle';
      loadStatus = 'idle';
    } catch (err) {
      editError = errorMessage(err, "Impossible d'enregistrer la disponibilité.");
      editStatus = 'error';
    }
  }

  // ── Push machine ────────────────────────────────────────────────────────
  async function startPush(): Promise<void> {
    if (isPushBusy(pushStatus)) {
      return;
    }
    if (availability === null) {
      pushStatus = 'error';
      pushError = 'Renseignez votre disponibilité avant de la pousser.';
      resetPlatformStatuses();
      return;
    }
    pushStatus = 'preparing';
    pushError = null;
    resetPlatformStatuses();

    // Pure prepare in core.
    const payloads = buildAvailabilityPayloads(availability, deps.platforms);
    const sample = payloads.values().next().value ?? '';

    try {
      await deps.copyToClipboard(sample);
    } catch {
      for (const target of deps.platforms) {
        setPlatformStatus(target.id, 'error');
      }
      pushStatus = 'error';
      pushError = PUSH_COPY_DENIED;
      return;
    }

    if (readPushStatus() === 'cancelled') {
      for (const target of deps.platforms) {
        setPlatformStatus(target.id, 'skipped');
      }
      return;
    }

    pushStatus = 'pushing';

    let done = 0;
    let failed = 0;
    for (const target of deps.platforms) {
      if (readPushStatus() === 'cancelled') {
        setPlatformStatus(target.id, 'skipped');
        continue;
      }
      setPlatformStatus(target.id, 'copying');
      try {
        // Payload is already on the clipboard from the probe above. Opening
        // the tab steals focus and breaks subsequent clipboard writes, so we
        // only open the profile URL and let the user paste manually.
        await deps.openUrl(target.profileUrl);
        setPlatformStatus(target.id, 'done');
        done += 1;
      } catch {
        setPlatformStatus(target.id, 'error');
        failed += 1;
      }
    }

    if (readPushStatus() === 'cancelled') {
      return;
    }

    if (done === deps.platforms.length) {
      pushStatus = 'pushed';
      lastPushedAt = deps.now();
    } else if (done > 0) {
      pushStatus = 'partial';
      lastPushedAt = deps.now();
    } else {
      pushStatus = 'error';
    }

    if (failed > 0 && done === 0) {
      pushError = 'La diffusion a échoué sur toutes les plateformes.';
    }
  }

  function cancelPush(): void {
    if (pushStatus !== 'pushing' && pushStatus !== 'preparing') {
      return;
    }
    pushStatus = 'cancelled';
  }

  // ── PROFILE_UPDATED (external merge) ────────────────────────────────────
  function applyProfileUpdate(incoming: Availability | null): void {
    if (
      editStatus === 'editing' ||
      editStatus === 'saving' ||
      pushStatus === 'preparing' ||
      pushStatus === 'pushing'
    ) {
      return; // dropped during in-flight edit/push
    }
    availability = incoming;
    loadStatus = 'idle';
    loadError = null;
    editError = null;
    editStatus = 'idle';
    draft = null;
    pushStatus = 'idle';
    pushError = null;
    lastPushedAt = null;
    platformStatuses = new Map();
  }

  return {
    get availability() {
      return availability;
    },
    get loadStatus() {
      return loadStatus;
    },
    get editStatus() {
      return editStatus;
    },
    get draft() {
      return draft;
    },
    get pushStatus() {
      return pushStatus;
    },
    get platformStatuses() {
      return platformStatuses;
    },
    get lastPushedAt() {
      return lastPushedAt;
    },
    get loadError() {
      return loadError;
    },
    get editError() {
      return editError;
    },
    get pushError() {
      return pushError;
    },
    get canPush() {
      return canPush;
    },
    get isPushing() {
      return isPushing;
    },
    load,
    reload,
    startEdit,
    cancelEdit,
    saveDraft,
    applyProfileUpdate,
    startPush,
    cancelPush,
  };
}

function isPushBusy(status: PushStatus): boolean {
  return status === 'preparing' || status === 'pushing';
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.length > 0) {
    return err.message;
  }
  return fallback;
}
