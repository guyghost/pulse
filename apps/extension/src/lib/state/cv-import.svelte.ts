import type { CanonicalCandidateProfileDraft } from '$lib/core/profile-extractors/types';
import type { Experience } from '$lib/core/types/profile';
import { previewExperienceImport } from '$lib/core/cv/experience-helpers';
import {
  ensureLinkedInHostPermission,
  importLinkedInProfile,
  syncLinkedInProfileImport,
} from '$lib/shell/facades/profile-sync.facade';
import { getProfile } from '$lib/shell/facades/settings.facade';

export function createCvImportStore(onSaved: (experiences: Experience[]) => void) {
  let draft = $state<CanonicalCandidateProfileDraft | null>(null);
  let current = $state<Experience[]>([]);
  let selected = $state<number[]>([]);
  let busy = $state(false);
  let error = $state('');
  let status = $state('');
  const rows = $derived(previewExperienceImport(current, draft?.experiences ?? []));
  return {
    get draft() {
      return draft;
    },
    get rows() {
      return rows;
    },
    get selected() {
      return selected;
    },
    get busy() {
      return busy;
    },
    get error() {
      return error;
    },
    get status() {
      return status;
    },
    async extract() {
      if (busy || draft) {
        return;
      }
      busy = true;
      error = '';
      status = '';
      try {
        if (!(await ensureLinkedInHostPermission())) {
          throw new Error('Autorisation LinkedIn refusée.');
        }
        const extracted = await importLinkedInProfile();
        if (!extracted.imported) {
          throw new Error(extracted.errorMessage);
        }
        const profile = await getProfile();
        current = profile?.experiences ?? [];
        if (!extracted.profile.experiences.length) {
          status = 'Aucune expérience renseignée sur votre profil LinkedIn.';
          return;
        }
        draft = {
          ...extracted.profile,
          experiences: previewExperienceImport(current, extracted.profile.experiences).map(
            (row) => row.draft
          ),
        };
        selected = previewExperienceImport(current, draft.experiences).flatMap((row, index) =>
          row.status === 'identical' ? [] : [index]
        );
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Import LinkedIn impossible.';
      } finally {
        busy = false;
      }
    },
    toggle(index: number) {
      selected = selected.includes(index)
        ? selected.filter((item) => item !== index)
        : [...selected, index];
    },
    cancel() {
      if (busy) {
        return;
      }
      draft = null;
      selected = [];
      status = 'Import annulé. Aucune modification enregistrée.';
      error = '';
    },
    async confirm() {
      if (busy || !draft || !selected.length) {
        return;
      }
      busy = true;
      error = '';
      try {
        const result = await syncLinkedInProfileImport({
          ...draft,
          experiences: draft.experiences.filter((_, index) => selected.includes(index)),
        });
        if (!result.imported) {
          throw new Error(result.errorMessage);
        }
        // Read back the committed profile, including all unselected and manual entries.
        const profile = await getProfile();
        if (profile) {
          onSaved(profile.experiences);
        }
        status = `${selected.length} expérience${selected.length > 1 ? 's' : ''} validée${selected.length > 1 ? 's' : ''} et enregistrée${selected.length > 1 ? 's' : ''}.`;
        draft = null;
        selected = [];
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Impossible d’enregistrer l’import.';
      } finally {
        busy = false;
      }
    },
  };
}
