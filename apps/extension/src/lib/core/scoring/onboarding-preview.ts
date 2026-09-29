import type { Mission, RemoteType } from '../types/mission';
import type { UserProfile } from '../types/profile';
import { createMission } from '../connectors/parser-utils';
import { scoreMission } from './relevance';
import { scoreToGrade, type Grade } from '../types/score';

/**
 * Live onboarding preview (models/onboarding-live-preview.model.md).
 * Deterministic reference mission — a "typical" market posting the wizard
 * scores against so users see the effect of their criteria immediately.
 */
// Built through the canonical factory so it is a real `Mission` (typed
// `scrapedAt: Date`, a valid `MissionSource`, scoring fields defaulted) instead
// of an `as unknown as Mission` cast. `source` is never displayed in the
// wizard — it only needs to be a valid enum member.
export const REFERENCE_MISSION: Mission = createMission({
  id: 'reference-mission',
  title: 'Développeur React/Node — plateforme SaaS',
  client: 'Studio produit',
  description: '',
  stack: ['React', 'TypeScript', 'Node.js'],
  tjm: 520,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  duration: null,
  url: 'https://example.com/reference',
  source: 'free-work',
  scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
});

/** Draft criteria as edited in the wizard; all fields optional/neutral. */
export interface OnboardingPreviewInput {
  tjmMin: number;
  /** null = sans plafond (DAO #174) — le wizard ne collecte plus de maximum. */
  tjmMax: number | null;
  remote: RemoteType | 'any';
  keywords: string[];
  location: string;
}

export interface OnboardingPreviewResult {
  grade: Grade;
  score: number;
  /** Dynamic label bucket derived from the grade only. */
  label: 'Forte correspondance' | 'Correspondance partielle' | 'Hors critères';
}

/**
 * Score the reference mission against the in-progress draft profile.
 * Pure and synchronous: no I/O, no persistence, no wizard state mutation.
 * An empty draft scores against the neutral defaults — defined, never hidden.
 */
export function previewOnboardingMatch(input: OnboardingPreviewInput): OnboardingPreviewResult {
  const profile: UserProfile = {
    firstName: '',
    keywords: input.keywords,
    tjmMin: input.tjmMin,
    tjmMax: input.tjmMax,
    location: input.location,
    remote: input.remote,
    // The wizard never collects seniority; 'confirmed' matches the reference
    // mission's audience and keeps the bonus neutral (no mismatch penalty).
    seniority: 'confirmed',
    jobTitle: '',
    experiences: [],
    availability: null,
  };

  const { total } = scoreMission(REFERENCE_MISSION, profile);
  const grade = scoreToGrade(total);
  const label =
    grade === 'A' || grade === 'B'
      ? 'Forte correspondance'
      : grade === 'C' || grade === 'D'
        ? 'Correspondance partielle'
        : 'Hors critères';

  return { grade, score: total, label };
}
