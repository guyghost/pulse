/**
 * CV experience feed store.
 *
 * Implements the two cooperating state machines defined in
 * `apps/extension/src/models/cv-experience-sync.model.md`:
 *   - Feed: loading / ready / error
 *   - Edit: idle / adding / editing / saving / deleting / error
 *
 * The store is the Imperative Shell: it owns async + side effects and delegates
 * all computation to pure helpers in `$lib/core/cv/experience-helpers`. The LLM
 * never decides a transition here — it only produces signals (imported drafts)
 * that the model merges via `mergeExperiences`.
 *
 * Svelte 5 runes only.
 */
import type { Experience } from '$lib/core/types/profile';
import { normalizeExperience, recomputePositionIndex } from '$lib/core/cv/experience-helpers';

export type FeedStatus = 'loading' | 'ready' | 'error';
export type EditStatus = 'idle' | 'adding' | 'editing' | 'saving' | 'deleting' | 'error';
export interface CvExperienceDeps {
  loadExperiences(): Promise<Experience[]>;
  /** Persist the full experiences list to the user profile. */
  saveExperiences(experiences: Experience[]): Promise<void>;
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
  readonly feedError: string | null;
  readonly editError: string | null;
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
}

export function createCvExperienceStore(deps: CvExperienceDeps): CvExperienceStore {
  let experiences = $state<Experience[]>([]);
  let feedStatus = $state<FeedStatus>('loading');
  let editStatus = $state<EditStatus>('idle');
  let draft = $state<Experience | null>(null);
  let editingId = $state<string | null>(null);
  let feedError = $state<string | null>(null);
  let editError = $state<string | null>(null);

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
        employmentType: null,
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

  // ── PROFILE_UPDATED (external merge) ────────────────────────────────────
  function applyProfileUpdate(incoming: Experience[]): void {
    // invariant 3: dropped during in-flight save/delete and active edit.
    if (
      editStatus === 'adding' ||
      editStatus === 'editing' ||
      editStatus === 'saving' ||
      editStatus === 'deleting'
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
    get feedError() {
      return feedError;
    },
    get editError() {
      return editError;
    },
    load,
    reload,
    applyProfileUpdate,
    newExperience,
    editExperience,
    cancelEdit,
    saveExperience,
    deleteExperience,
  };
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.length > 0) {
    return err.message;
  }
  return fallback;
}
