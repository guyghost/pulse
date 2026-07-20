import { sha256Jcs } from './canonical';
import type { GlobalReleaseCatalogV1 } from './contracts';
import type { ReleaseReadinessContextV1 } from './reducer';

export type CandidateReplacementClosureProofV1 =
  | {
      readonly disposition: 'no_journal';
      readonly releaseId: string;
      readonly releaseNamespace: string;
      readonly nextReleaseNamespace: string;
    }
  | {
      readonly disposition: 'observed_absent';
      readonly priorDisposition: 'no_journal' | 'cleaned';
      readonly observationId: string;
      readonly observationSha256: string;
      readonly journalId: string | null;
      readonly releaseId: string;
      readonly staging: 'absent';
      readonly final: 'absent';
    }
  | {
      readonly disposition: 'published';
      readonly catalogSequence: number;
      readonly releaseId: string;
      readonly artifactId: string;
      readonly artifactSha256: string;
    };

function observationPathIsAbsent(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === 'absent'
  );
}

function observationDigest(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  try {
    return sha256Jcs(
      typeof record.observationSha256 === 'string'
        ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'observationSha256'))
        : record
    );
  } catch {
    return null;
  }
}

function packageJournalPhase(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const history = (value as Record<string, unknown>).history;
  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }
  const latest = history.at(-1);
  return typeof latest === 'object' && latest !== null && !Array.isArray(latest)
    ? (((latest as Record<string, unknown>).phase as string | undefined) ?? null)
    : null;
}

function packageJournalId(value: unknown): string | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (((value as Record<string, unknown>).journalId as string | undefined) ?? null)
    : null;
}

export function deriveCandidateReplacementClosureProof(
  context: ReleaseReadinessContextV1,
  catalog: GlobalReleaseCatalogV1,
  nextReleaseNamespace: string
): CandidateReplacementClosureProofV1 | null {
  const publication = catalog.records.find(
    (record) =>
      record.kind === 'artifact_published' &&
      record.actorId === context.actorId &&
      record.releaseId === context.candidate.releaseId
  );
  if (
    publication !== undefined &&
    context.artifact !== null &&
    packageJournalPhase(context.packageJournal) === 'published' &&
    publication.artifactId !== null &&
    publication.artifactSha256 !== null
  ) {
    return {
      disposition: 'published',
      catalogSequence: publication.catalogSequence,
      releaseId: publication.releaseId,
      artifactId: publication.artifactId,
      artifactSha256: publication.artifactSha256,
    };
  }

  if (
    context.packageJournal === null &&
    nextReleaseNamespace !== context.candidate.releaseNamespace
  ) {
    return {
      disposition: 'no_journal',
      releaseId: context.candidate.releaseId,
      releaseNamespace: context.candidate.releaseNamespace,
      nextReleaseNamespace,
    };
  }

  const observation = context.lastLocalObservation;
  if (
    observation === null ||
    observation.valid !== true ||
    observationDigest(observation.observation) !== observation.observationSha256
  ) {
    return null;
  }
  const value = observation.observation;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.observationId !== observation.observationId ||
    record.restartId !== observation.restartId ||
    record.releaseId !== context.candidate.releaseId ||
    !observationPathIsAbsent(record.staging) ||
    !observationPathIsAbsent(record.final)
  ) {
    return null;
  }
  const journalId = packageJournalId(context.packageJournal);
  const priorDisposition = context.packageJournal === null ? 'no_journal' : 'cleaned';
  if (
    (priorDisposition === 'no_journal' && record.journalId !== null) ||
    (priorDisposition === 'cleaned' &&
      (packageJournalPhase(context.packageJournal) !== 'cleaned' ||
        journalId === null ||
        record.journalId !== journalId))
  ) {
    return null;
  }
  return {
    disposition: 'observed_absent',
    priorDisposition,
    observationId: observation.observationId,
    observationSha256: observation.observationSha256,
    journalId,
    releaseId: context.candidate.releaseId,
    staging: 'absent',
    final: 'absent',
  };
}
