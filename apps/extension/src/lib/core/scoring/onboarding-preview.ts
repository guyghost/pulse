import type { Mission, RemoteType } from '../types/mission';
import type { UserProfile } from '../types/profile';
import { scoreMission } from './relevance';
import { scoreToGrade, type Grade } from '../types/score';

/**
 * Live onboarding preview (models/onboarding-live-preview.model.md).
 * Deterministic reference mission — a "typical" market posting the wizard
 * scores against so users see the effect of their criteria immediately.
 */
export const REFERENCE_MISSION: Mission = {
  id: 'reference-mission',
  title: 'Développeur React/Node — plateforme SaaS',
  client: 'Studio produit',
  stack: ['React', 'TypeScript', 'Node.js'],
  tjm: 520,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  url: 'https://example.com/reference',
  source: 'reference',
  scrapedAt: '2026-01-01T00:00:00.000Z',
  publishedAt: null,
  description: '',
} as unknown as Mission;

/** Draft criteria as edited in the wizard; all fields optional/neutral. */
export interface OnboardingPreviewInput {
  tjmMin: number;
  tjmMax: number;
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
