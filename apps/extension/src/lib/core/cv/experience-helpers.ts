/**
 * Pure helpers for the CV experience feed.
 *
 * STRICTLY PURE: no Date, no async, no I/O, no side effects. Non-deterministic
 * values (`now`, id generation) are injected by the shell caller.
 *
 * See `apps/extension/src/models/cv-experience-sync.model.md` for the state
 * machine that consumes these helpers.
 */
import type { Experience, ExperienceSource } from '../types/profile';
import type { CandidateExperienceDraft } from '../profile-extractors/types';

/** "2023 — présent" / "2023 — 2025" / "2023" / "" when no dates. */
export function formatExperienceDateRange(
  exp: Pick<Experience, 'startDate' | 'endDate' | 'isCurrent'>
): string {
  const start = exp.startDate ?? '';
  if (!start) {
    return '';
  }
  if (exp.isCurrent) {
    return `${start} — présent`;
  }
  const end = exp.endDate ?? '';
  return end ? `${start} — ${end}` : start;
}

/**
 * Normalize a raw/edited experience draft into a canonical {@link Experience}.
 * Enforces the `isCurrent ↔ endDate === null` invariant and trims all text.
 * Does NOT assign `positionIndex` (that is {@link recomputePositionIndex}'s job).
 */
export function normalizeExperience(
  draft: Partial<Experience> & { title: string },
  now: number,
  generateId: () => string
): Experience {
  const title = draft.title.trim();
  const isCurrent = draft.isCurrent ?? false;
  const endDate = isCurrent ? null : (trimToNull(draft.endDate) ?? null);
  const source: ExperienceSource = draft.source ?? 'manual';

  return {
    id: draft.id ?? generateId(),
    title,
    company: trimToNull(draft.company) ?? null,
    employmentType: trimToNull(draft.employmentType) ?? null,
    location: trimToNull(draft.location) ?? null,
    startDate: trimToNull(draft.startDate) ?? null,
    endDate,
    isCurrent,
    description: (draft.description ?? '').trim(),
    skills: (draft.skills ?? []).map((s) => s.trim()).filter((s) => s.length > 0),
    source,
    sourceExternalId: draft.sourceExternalId ?? null,
    positionIndex: draft.positionIndex ?? 0,
    updatedAt: now,
  };
}

/**
 * Recompute gapless `positionIndex` (0 = most recent). Sorts by `startDate`
 * descending; entries without a start date keep their relative order at the
 * end. Stable: ties preserve the input order.
 */
export function recomputePositionIndex(experiences: readonly Experience[]): Experience[] {
  const indexed = experiences.map((exp, originalIndex) => ({ exp, originalIndex }));
  indexed.sort((a, b) => {
    const sa = a.exp.startDate ?? '';
    const sb = b.exp.startDate ?? '';
    if (sa !== sb) {
      return sb < sa ? -1 : 1; // descending start date
    }
    return a.originalIndex - b.originalIndex; // stable tiebreak
  });
  return indexed.map(({ exp }, i) => ({ ...exp, positionIndex: i }));
}

/**
 * Merge imported draft experiences into the current persisted list.
 *
 * Dedup key: `(company, title, startDate)` case-insensitively. On match, the
 * manual entry is preserved entirely. Imported entries retain identity and
 * metadata, update approved facts and union skills. New drafts become `source: 'linkedin'`
 * entries with a `now`-seeded id. The result is position-indexed via
 * {@link recomputePositionIndex}.
 */
export function mergeExperiences(
  current: readonly Experience[],
  incoming: readonly CandidateExperienceDraft[],
  now: number
): Experience[] {
  const result: Experience[] = current.map((exp) => ({ ...exp, skills: [...exp.skills] }));

  incoming.forEach((draft, importIndex) => {
    // Normalize imported dates (LinkedIn yields YYYY-MM-DD) to the canonical
    // YYYY-MM month format so they dedupe against manual entries and are valid
    // when edited through the month input.
    const draftStart = normalizeDateToMonth(draft.startDate);
    const draftEnd = normalizeDateToMonth(draft.endDate);
    const existingIdx = result.findIndex((exp) => matchesExperience(exp, draft));

    if (existingIdx >= 0) {
      const existing = result[existingIdx];
      // Manual entries remain authoritative, including their metadata and skills.
      if (existing.source === 'manual') {
        return;
      }
      result[existingIdx] = {
        ...existing,
        title: draft.title,
        company: draft.company,
        startDate: draftStart,
        skills: unionSkills(existing.skills, draft.skills),
        description: draft.description || existing.description,
        employmentType: draft.employmentType ?? existing.employmentType,
        location:
          existing.source === 'linkedin' ? draft.location : (draft.location ?? existing.location),
        endDate: draft.isCurrent ? null : draftEnd,
        isCurrent: draft.isCurrent,
        sourceExternalId: existing.sourceExternalId ?? draft.sourceExternalId,
      };
      return;
    }

    let id = `exp-${now}-${importIndex}`;
    while (result.some((exp) => exp.id === id)) {
      id += '-new';
    }
    result.push({
      id,
      title: draft.title,
      company: draft.company,
      employmentType: draft.employmentType,
      location: draft.location,
      startDate: draftStart,
      endDate: draft.isCurrent ? null : draftEnd,
      isCurrent: draft.isCurrent,
      description: draft.description,
      skills: [...draft.skills],
      source: 'linkedin',
      sourceExternalId: draft.sourceExternalId,
      positionIndex: draft.positionIndex,
      updatedAt: now,
    });
  });

  return recomputePositionIndex(result);
}

/**
 * Normalize a date string to the canonical `YYYY-MM` month format used by
 * {@link Experience}. Accepts `YYYY-MM`, `YYYY-M`, `YYYY-MM-DD`, and `YYYY-M-D`.
 * Unknown formats are returned trimmed (unchanged) so manual entries are not
 * corrupted. Returns null for empty/whitespace input.
 */
export function normalizeDateToMonth(date: string | null | undefined): string | null {
  if (!date) {
    return null;
  }
  const trimmed = date.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const match = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  return `${match[1]}-${match[2].padStart(2, '0')}`;
}

/**
 * Count how many of the incoming drafts would be ADDED as new experiences —
 * i.e. do not match any current entry by the {@link mergeExperiences} dedup key
 * `(company, title, normalizeDateToMonth(startDate))`. Mirrors the dedup logic
 * WITHOUT performing the merge, so the shell can report a truthful
 * "N new experiences imported" count and avoid a success toast when nothing was
 * actually added (empty extraction or full dedup).
 *
 * STRICTLY PURE.
 */
export function countNewlyAddedExperiences(
  current: readonly Experience[],
  incoming: readonly CandidateExperienceDraft[]
): number {
  return mergeExperiences(current, incoming, 0).length - current.length;
}

function experienceKey(company: string | null, title: string, startDate: string | null): string {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  return JSON.stringify([
    normalize(company ?? ''),
    normalize(title),
    normalizeDateToMonth(startDate),
  ]);
}

export function matchesExperience(existing: Experience, draft: CandidateExperienceDraft): boolean {
  const externalId = draft.sourceExternalId;
  // LinkedIn extractors currently emit position-based IDs: never use them as identity.
  const stable = externalId && !/^linkedin-experience-\d+$/.test(externalId);
  return (
    Boolean(
      stable && existing.source === draft.source && existing.sourceExternalId === externalId
    ) ||
    experienceKey(existing.company, existing.title, existing.startDate) ===
      experienceKey(draft.company, draft.title, draft.startDate)
  );
}

export interface ExperienceImportPreview {
  draft: CandidateExperienceDraft;
  current: Experience | null;
  proposed: Experience;
  status: 'new' | 'modified' | 'identical';
}

/** Group incoming identities and preview exactly their final persistence merge. */
export function previewExperienceImport(
  current: readonly Experience[],
  incoming: readonly CandidateExperienceDraft[]
): ExperienceImportPreview[] {
  let merged = [...current];
  const importedIds: string[] = [];
  for (const draft of incoming) {
    const existing = merged.find((exp) => matchesExperience(exp, draft));
    const next = mergeExperiences(merged, [draft], 0);
    const target = existing ?? next.find((exp) => !merged.some((item) => item.id === exp.id));
    if (target && !importedIds.includes(target.id)) {
      importedIds.push(target.id);
    }
    merged = next;
  }
  return importedIds.flatMap((id) => {
    const proposed = merged.find((exp) => exp.id === id);
    if (!proposed) {
      return [];
    }
    const existing = current.find((exp) => exp.id === id) ?? null;
    // A selected row carries the grouped facts, never the original duplicate rows.
    const { id: _id, updatedAt: _updatedAt, ...draft } = proposed;
    const comparable = (exp: Experience) => ({ ...exp, positionIndex: 0, updatedAt: 0 });
    return [
      {
        draft,
        current: existing,
        proposed,
        status: !existing
          ? ('new' as const)
          : JSON.stringify(comparable(existing)) === JSON.stringify(comparable(proposed))
            ? ('identical' as const)
            : ('modified' as const),
      },
    ];
  });
}

function unionSkills(current: readonly string[], incoming: readonly string[]): string[] {
  const result = [...current];
  for (const skill of incoming) {
    const trimmed = skill.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (!result.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      result.push(trimmed);
    }
  }
  return result;
}

function trimToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
