/**
 * Pure helpers for the CV experience feed and cross-platform sync.
 *
 * STRICTLY PURE: no Date, no async, no I/O, no side effects. Non-deterministic
 * values (`now`, id generation) are injected by the shell caller.
 *
 * See `apps/extension/src/models/cv-experience-sync.model.md` for the state
 * machine that consumes these helpers.
 */
import type { Experience, ExperienceSource } from '../types/profile';
import type { CandidateExperienceDraft } from '../profile-extractors/types';

/** A platform target for the sync push (LinkedIn + mission connectors). */
export interface PlatformSyncTarget {
  id: string;
  name: string;
  profileUrl: string;
}

/** Build the per-platform text payload (same CV block for every target). */
export function buildPlatformPayloads(
  experiences: readonly Experience[],
  targets: readonly PlatformSyncTarget[]
): Map<string, string> {
  const payload = formatExperiencePayload(experiences);
  const map = new Map<string, string>();
  for (const target of targets) {
    map.set(target.id, payload);
  }
  return map;
}

/** Format the experiences into a copy-pasteable CV block. */
export function formatExperiencePayload(experiences: readonly Experience[]): string {
  if (experiences.length === 0) {
    return '';
  }

  const blocks = experiences.map((exp) => {
    const head = [exp.title, exp.company].filter((part) => part && part.length > 0).join(' — ');
    const range = formatExperienceDateRange(exp);
    const lines: string[] = [head + (range ? ` · ${range}` : '')];
    if (exp.location) {
      lines.push(exp.location);
    }
    if (exp.description) {
      lines.push(exp.description);
    }
    if (exp.skills.length > 0) {
      lines.push(`Stack: ${exp.skills.join(', ')}`);
    }
    return lines.join('\n');
  });

  return blocks.join('\n\n');
}

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
 * local entry is kept (id, positionIndex, source, description when manual) and
 * its skills are unioned with the draft's. New drafts become `source: 'linkedin'`
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
    const key = experienceKey(draft.company, draft.title, draftStart);
    const existingIdx = result.findIndex(
      (exp) => experienceKey(exp.company, exp.title, exp.startDate) === key
    );

    if (existingIdx >= 0) {
      const existing = result[existingIdx];
      const keepDescription = existing.source === 'manual' || draft.description.length === 0;
      const mergedIsCurrent = existing.isCurrent || draft.isCurrent;
      result[existingIdx] = {
        ...existing,
        skills: unionSkills(existing.skills, draft.skills),
        description: keepDescription ? existing.description : draft.description,
        location: existing.location ?? draft.location,
        endDate: mergedIsCurrent ? null : (existing.endDate ?? draftEnd ?? null),
        isCurrent: mergedIsCurrent,
        sourceExternalId: existing.sourceExternalId ?? draft.sourceExternalId,
      };
      return;
    }

    result.push({
      id: `exp-${now}-${importIndex}`,
      title: draft.title,
      company: draft.company,
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

function experienceKey(company: string | null, title: string, startDate: string | null): string {
  return `${(company ?? '').toLowerCase()}|${title.toLowerCase()}|${startDate ?? ''}`;
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
